// aiAgent — AI 助手 agentic 循环
//
// 流程：
//   1) 把 system prompt + 最近对话 + 当前 user 消息 → /api/ai/chat/stream
//   2) 流式 delta 写入"当前 assistant 占位消息"
//   3) 流完检查是否含 <tool>...</tool> 完整标签
//      - 没有 → 结束
//      - 有   → 执行工具 → 每个结果作为一条 role=user + kind:'tool-result'(<<TOOL_RESULT>>) 消息追加
//               然后回到 1（重新发一条）
//   最多 6 轮；重复工具签名去重（防死循环）；transcript > 80k 字符丢最旧对话对
//
// 注意：模型侧 msgs 是"完整历史 + 当前请求"的合并，与 UI 的 .slice(-6) 解耦
// 后端无状态，所以整个循环在客户端完成

import { aiApi } from '../../api/index.js';
import { parseToolTags } from './sandbox.js';
import { executeTool, executeWriteToolPayload, describeWriteTool } from './aiTools.js';
import { shouldFallbackToLegacy } from './legacyFallback.js';

const MAX_TURNS = 6;
const MAX_TRANSCRIPT_CHARS = 80_000;
const CONFIRM_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟未响应自动 reject
const THINK_TAG_RE = /<\/?think>/g;

// 工具结果回灌格式：role=user + 哨兵分隔符 + kind 标记
// 不用 role:'tool' 是因为 minimax 等平台在收到该 role 时要求带 tool_call_id；
// 但我们走的是「文本里的 <tool>...</tool>」协议，AI 没原生 tool_calls 结构，强行带 mock id 会被 400
// 所以统一用 user 角色，AI 看到 <<<TOOL_RESULT>>> 哨兵就知道是工具结果
function formatToolResult(name, ok, result) {
  const tag = `<<<TOOL_RESULT ${name} ${ok ? 'OK' : 'ERROR'}>>>`;
  const end = '<<<END>>>';
  let body;
  if (typeof result === 'string') body = result;
  else body = JSON.stringify(result, null, 0);
  return `${tag}\n${body}\n${end}`;
}

// 从一段文本里解析所有工具标签，返回 [{name, args}]；过滤掉未闭合的尾部
function completedTools(text) {
  const { tools } = parseToolTags(text);
  return tools.map((t) => ({ name: t.name, args: t.args }));
}

/**
 * 跑一次 SSE 流（指定端点）；返回 { text, toolCalls, usageRecord, model, endpoint }
 *   text        完整 assistant 文本（已剥离 <think> 标签）
 *   toolCalls   从服务端 tool_calls 事件拿到的结构化数组（3A 起的 /api/ai/agent）
 *   usageRecord 服务端记的本次用量（用于 UI 即时刷新用量面板）
 *   model       服务端回传的模型名
 *   endpoint    实际使用的端点 URL（'agent' | 'chat/stream' | 'failed'）— phase-7 给 UI 提示用
 *   fellBack    是否走了 legacyFallback
 *
 * @param {string} url         端点 URL
 * @param {Array} messages      完整消息历史
 * @param {string} platform     AI 平台
 * @param {object} hooks        { onDelta(delta), signal: AbortSignal, attachments? }
 */
function streamOnceWithEndpoint(url, messages, platform, hooks) {
  const { onDelta, signal, attachments = [], sessionId, roundId, tempApiKey, tempBaseUrl, tempModel } = hooks;
  return new Promise((resolve) => {
    let buf = '';
    let consumedLen = 0;
    let aborted = false;
    const body = JSON.stringify({
      platform,
      messages,
      options: { temperature: 0.5, max_tokens: 2000 },
      sessionId,
      roundId,
      stream: true,
      // 会话 Key（纯 session，刷新/关闭即清）：有则走 body，不依赖服务端 DB
      ...(tempApiKey ? { tempApiKey, tempBaseUrl: tempBaseUrl || undefined, tempModel: tempModel || undefined } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 0;

    let serverToolCalls = null;     // 服务端结构化 toolCalls
    let serverUsage = null;         // 服务端记录的本次用量
    let serverModel = null;
    let resolved = false;

    const safeResolve = (extra) => {
      if (resolved) return;
      resolved = true;
      resolve({ text: '', toolCalls: serverToolCalls, usageRecord: serverUsage, model: serverModel, endpoint: url, ...extra });
    };

    if (signal) {
      if (signal.aborted) { safeResolve({ aborted: true }); return; }
      signal.addEventListener('abort', () => {
        aborted = true;
        try { xhr.abort(); } catch (_) {}
      }, { once: true });
    }

    const processBuffer = () => {
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const lines = raw.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          const l = line.trim();
          if (l.startsWith('event:')) event = l.slice(6).trim();
          else if (l.startsWith('data:')) data += l.slice(5).trim();
        }
        if (event === 'delta' && data) {
          try {
            const obj = JSON.parse(data);
            if (obj.content) onDelta(obj.content);
          } catch (_) {}
        } else if (event === 'tool_calls' && data) {
          // 3A 服务端解析后的结构化 toolCalls
          try {
            const obj = JSON.parse(data);
            if (obj.toolCalls && Array.isArray(obj.toolCalls)) serverToolCalls = obj.toolCalls;
          } catch (_) {}
        } else if (event === 'usage' && data) {
          try { serverUsage = JSON.parse(data); } catch (_) {}
        } else if (event === 'done' && data) {
          try {
            const obj = JSON.parse(data);
            if (obj.model) serverModel = obj.model;
          } catch (_) {}
        } else if (event === 'error' && data) {
          try { onDelta('\n\n❌ ' + JSON.parse(data).message); } catch (_) { onDelta('\n\n❌ ' + data); }
        }
      }
    };

    xhr.onprogress = () => {
      const t = xhr.responseText || '';
      if (t.length > consumedLen) {
        buf += t.slice(consumedLen);
        consumedLen = t.length;
        processBuffer();
      }
    };

    xhr.onloadend = () => {
      // phase-7: 区分"成功""需 fallback""失败"
      const status = xhr.status;
      const readyState = xhr.readyState;
      if (shouldFallbackToLegacy(status, readyState)) {
        // 老后端没这个端点 → 由 streamOnce 顶层 catch → 重新打 chat/stream
        return safeResolve({ fallbackNeeded: true, status });
      }
      if (!aborted) {
        const t = xhr.responseText || '';
        if (t.length > consumedLen) {
          buf += t.slice(consumedLen);
          consumedLen = t.length;
          processBuffer();
        }
      }
      safeResolve({ status });
    };

    xhr.onerror = () => {
      if (!aborted) onDelta('\n\n❌ 网络错误');
      // 网络层失败也可能触发 fallback（status=0 + readyState=4）
      const status = xhr.status;
      const readyState = xhr.readyState;
      if (shouldFallbackToLegacy(status, readyState)) {
        return safeResolve({ fallbackNeeded: true, status });
      }
      safeResolve({ status });
    };

    xhr.send(body);
  });
}

/**
 * 跑一次 SSE 流；自动 fallback：先打 /api/ai/agent，404/405/网络失败 → /api/ai/chat/stream
 * 详见 shouldFallbackToLegacy。
 * 返回的 endpoint 字段会让 UI 知道是否走了兼容模式。
 *
 * @param {Array} messages      完整消息历史
 * @param {string} platform     AI 平台
 * @param {object} hooks        { onDelta(delta), signal: AbortSignal, ... }
 */
function streamOnce(messages, platform, hooks) {
  const { onDelta, tempApiKey, tempBaseUrl, tempModel } = hooks || {};
  const agentUrl = aiApi.agentStreamUrl();
  const legacyUrl = aiApi.chatStreamUrl();

  // 注意：不并行打两个端点（避免双倍计费 + 重复响应干扰）
  // 先打新端点，只有 fallbackNeeded=true 才打老端点；老端点失败不再尝试
  return streamOnceWithEndpoint(agentUrl, messages, platform, hooks).then((res) => {
    if (res.fallbackNeeded) {
      // 透明提示用户：已切换到兼容模式
      if (onDelta) onDelta('\n\n_（已自动切换到兼容模式 — 服务端不支持 agent 端点）_\n');
      return streamOnceWithEndpoint(legacyUrl, messages, platform, hooks).then((res2) => ({
        ...res2,
        fellBack: true,
      }));
    }
    return res;
  });
}

// transcript 超长时丢最旧的对话对（保留 system；保留最后一对 user/assistant）
function trimTranscript(messages) {
  const totalLen = messages.reduce((n, m) => n + (m.content || '').length, 0);
  if (totalLen <= MAX_TRANSCRIPT_CHARS) return messages;
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  // 始终保留最后 1 对（user + assistant）和 system
  while (rest.length > 2) {
    const len = rest.reduce((n, m) => n + (m.content || '').length, 0);
    if (len + systemMsgs.reduce((n, m) => n + m.content.length, 0) <= MAX_TRANSCRIPT_CHARS) break;
    rest.shift();
  }
  return [...systemMsgs, ...rest];
}

// 主入口：跑 agentic 循环
//   messages — 起始消息历史（一般含 system + 既有对话）
//   newUserText — 本轮用户消息
//   deps:
//     setMessages((arr) => newArr | arr): React state setter，控制 UI 消息列表
//     getViewer/getEditor/getFileStats: 数据源 getter
//     signal: AbortSignal
//     onToolStart(tool) / onToolEnd(tool, ok, result): 工具执行状态回调（UI 显示）
//     onUsage(usageRecord): 服务端返回的本次 model call 用量（用于 UI 顶部卡片即时刷新）
export async function runAgentLoop({
  messages, newUserText, platform, deps, sessionId,
  tempApiKey, tempBaseUrl, tempModel,
}) {
  const { setMessages, signal, onToolStart, onToolEnd, onUsage } = deps;
  let working = [...messages];

  // 把本轮用户消息推入（也同步到 UI）
  const userMsg = { role: 'user', content: newUserText, id: Date.now() + Math.random() };
  working.push(userMsg);
  setMessages((arr) => [...arr, userMsg]);

  const seen = new Set();
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) break;

    // 占位 assistant 消息
    const placeholderId = Date.now() + Math.random();
    const placeholder = { role: 'assistant', content: '', id: placeholderId, _streaming: true };
    working.push(placeholder);
    setMessages((arr) => [...arr, placeholder]);

    // 本轮 roundId：每个 model call 一行 ai_token_usage
    const roundId = `round_${Date.now()}_${turn}`;

    let streamedText = '';
    let serverToolCalls = null;
    const { toolCalls: streamToolCalls, usageRecord, model } = await streamOnce(trimTranscript(working), platform, {
      onDelta: (d) => {
        streamedText += d;
        // 把增量拼接到 UI 上对应 id 的消息
        setMessages((arr) => arr.map((m) =>
          m.id === placeholderId ? { ...m, content: (m.content || '') + d, _streaming: true } : m
        ));
      },
      signal,
      sessionId,
      roundId,
      tempApiKey,
      tempBaseUrl,
      tempModel,
    });
    serverToolCalls = streamToolCalls;
    // 即时刷新用量面板（服务端记的）
    if (usageRecord && onUsage) {
      try { onUsage({ ...usageRecord, roundId, platform, model }); } catch (_) {}
    }

    if (signal?.aborted) break;

    // 流结束：去掉 <think> 标签
    const clean = (streamedText || '').replace(THINK_TAG_RE, '');
    placeholder.content = clean;
    placeholder._streaming = false;
    placeholder.model = model;
    // 把 _streaming 标记从 UI 撤掉
    setMessages((arr) => arr.map((m) =>
      m.id === placeholderId ? { ...m, content: clean, _streaming: false, model } : m
    ));

    // 优先用服务端结构化 toolCalls（3A），退化到客户端 <tool> 正则（老后端）
    // 阶段 11：服务端现在发 MCP/OpenAI 兼容字段（function.{name,arguments}）
    let tools;
    if (serverToolCalls && serverToolCalls.length > 0) {
      tools = serverToolCalls.map((t) => {
        const fn = t.function || {};
        const name = fn.name || t.name;
        const args = fn.arguments != null ? fn.arguments : t.args;
        return {
          name,
          args,
          id: t.id || null,        // 阶段 11：MCP id 用于未来追踪
          type: t.type || 'function',
        };
      });
    } else {
      tools = completedTools(clean);
    }
    if (!tools.length) break;

    // 工具去重
    const sigs = tools.map((t) => `${t.name}(${t.args})`);
    const dup = sigs.find((s) => seen.has(s));
    if (dup) {
      const note = {
        role: 'user',
        kind: 'system-note',
        name: '__system__',
        content: `<<<SYSTEM_NOTE>>>检测到重复工具调用 \`${dup}\`，已停止继续调用。请基于已有结果给出最终答复。<<<END>>>`,
        id: Date.now() + Math.random(),
      };
      working.push(note);
      setMessages((arr) => [...arr, note]);
      break;
    }
    sigs.forEach((s) => seen.add(s));

    // 执行每个工具
    // 把本轮所有调用的工具记录到 placeholder 消息元数据，方便 UI 显示"已调用工具"chips
    // （借鉴 ChatGIS / GeoGPT 的工具回显 UX）
    if (!placeholder.toolCalls) placeholder.toolCalls = [];
    for (const t of tools) {
      if (signal?.aborted) break;
      onToolStart?.(t);
      const toolResult = await executeTool(t.name, t.args, {
        getViewer: deps.getViewer,
        getEditor: deps.getEditor,
        getFileStats: deps.getFileStats,
      });
      // 写工具需要用户确认
      if (toolResult.needsConfirm && toolResult.payload) {
        const desc = describeWriteTool(t.name, t.args) || { title: t.name, bullets: [], warnings: [] };
        let approved = false;
        let executed = { ok: false, result: '未执行' };
        if (deps.confirmWrite) {
          try {
            // 阶段 11：把 source 信息（platform / model / 第几轮 / 用量）传给弹窗
            const decide = await Promise.race([
              deps.confirmWrite({
                name: t.name,
                args: t.args,
                describe: desc,
                source: {
                  platform,
                  model,
                  agentRound: turn + 1,
                  maxRounds: MAX_TURNS,
                  usage: usageRecord || null,
                },
              }),
              new Promise((resolve) => setTimeout(() => resolve({ approved: false, timedOut: true }), CONFIRM_TIMEOUT_MS)),
            ]);
            if (decide && decide.approved) {
              approved = true;
              // 写工具真正执行：把 deps 整体透传（含 getEditor / getCesium / getPresets）
              executed = executeWriteToolPayload(t.name, toolResult.payload, deps);
            } else if (decide && decide.timedOut) {
              executed = { ok: false, result: '用户未在 5 分钟内确认，已自动取消' };
            } else {
              executed = { ok: false, result: '用户拒绝了此操作' };
            }
          } catch (e) {
            executed = { ok: false, result: `确认流程出错：${e.message}` };
          }
        } else {
          // 没有 confirmWrite hook 时视为拒绝（防御）
          executed = { ok: false, result: '当前 UI 不支持写工具（缺少 confirmWrite）' };
        }
        onToolEnd?.(t, executed.ok, executed.result);
        const resultMsg = {
          role: 'user',
          kind: 'tool-result',
          name: t.name,
          args: t.args,
          ok: executed.ok,
          content: formatToolResult(t.name, executed.ok, executed.result),
          id: Date.now() + Math.random(),
        };
        working.push(resultMsg);
        setMessages((arr) => [...arr, resultMsg]);
        placeholder.toolCalls.push({ name: t.name, args: t.args, ok: executed.ok, kind: 'write' });
        continue;
      }
      // 读工具直接拿结果
      const { ok, result } = toolResult;
      onToolEnd?.(t, ok, result);
      const resultMsg = {
        role: 'user',
        kind: 'tool-result',
        name: t.name,
        args: t.args,
        ok,
        content: formatToolResult(t.name, ok, result),
        id: Date.now() + Math.random(),
      };
      working.push(resultMsg);
      setMessages((arr) => [...arr, resultMsg]);
      placeholder.toolCalls.push({ name: t.name, args: t.args, ok, kind: 'read' });
    }
    // 把 toolCalls 同步到 UI 对应消息
    setMessages((arr) => arr.map((m) => m.id === placeholderId ? { ...m, toolCalls: placeholder.toolCalls } : m));
    if (signal?.aborted) break;

    // 引导消息：促使模型继续 / 给出最终答复
    const note = {
      role: 'user',
      kind: 'system-note',
      name: '__system__',
      content: '<<<SYSTEM_NOTE>>>以上是工具返回结果。请基于这些结果继续回答用户问题；如信息已足够，请直接给出最终答复，不要再调用工具。<<<END>>>',
      id: Date.now() + Math.random(),
    };
    working.push(note);
    setMessages((arr) => [...arr, note]);
  }

  return working;
}