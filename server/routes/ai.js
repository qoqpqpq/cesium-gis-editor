// AI 聚合对话 API（独立开源精简版）
// - 无数据库：Key 纯会话（tempCreds），不落盘
// - 保留：platforms / chat/stream / agent / scene-description
// - 剥离：keys CRUD / sessions / usage 查询 / recommend / system-prompts 端点
const express = require("express");
const aiService = require("../services/ai");
const aiPrompts = require("../services/ai-prompts");
const aiConcurrency = require("../middleware/aiConcurrency");
const { parseToolTags } = require("../agent/protocol/parse");

const router = express.Router();

/**
 * 把附件分成两类：
 * - textOnlyAttachments：纯文本（txt/csv/json 等），直接并入 user message 文字
 * - visionAttachments：图片/二进制，需要走平台 vision 格式
 */
function splitAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { textOnlyAttachments: [], visionAttachments: [] };
  }
  const textMimes = new Set([
    'text/plain', 'text/csv', 'text/markdown', 'text/html', 'text/xml',
    'application/json', 'application/xml', 'application/javascript', 'application/x-javascript',
  ]);
  const textOnly = [];
  const vision = [];
  for (const att of attachments) {
    if (!att || !att.data) continue;
    const mime = (att.mime || '').toLowerCase();
    if (mime.startsWith('image/')) {
      vision.push(att);
    } else if (textMimes.has(mime) || mime.startsWith('text/') ||
               /\.(txt|csv|json|md|js|ts|html|xml|log|yaml|yml|ini)$/i.test(att.filename || '')) {
      try {
        const text = Buffer.from(att.data, 'base64').toString('utf8');
        const truncated = text.length > 100 * 1024 ? text.slice(0, 100 * 1024) + '\n\n... (内容过长已截断)' : text;
        textOnly.push({ ...att, data: truncated });
      } catch (_) { /* skip undecodable */ }
    } else {
      const e = new Error(`不支持的附件类型: ${att.filename || mime || '未知'}`);
      e.status = 400;
      throw e;
    }
  }
  return { textOnlyAttachments: textOnly, visionAttachments: vision };
}

// 内置工具提示词（注入到 system message 最前面）
const BUILTIN_TOOLS_PROMPT = `你是一个友好、专业的 AI 助手，回答简洁清晰，使用中文。
当用户的需求需要调用工具才能完成时，用以下格式发起调用：
<tool>name(args)</tool>
- name 为工具名，args 为参数（多个参数以逗号分隔；无参数也要写 ()）
- 一次回复里可以包含多个 <tool>，服务端会按出现顺序依次执行
- 只有在确实没有合适工具时才走自然语言解释`;

// 从消息列表推导标题（用于分享 / 展示）
function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return '新对话';
  const text = (firstUser.content || '').replace(/<[^>]+>/g, '').trim();
  return text.slice(0, 30) || '新对话';
}

// ---- 平台列表 ----
router.get("/platforms", (req, res) => {
  res.json({ success: true, data: aiService.listPlatforms() });
});

// ---- 系统提示词（前端可拉取） ----
router.get("/system-prompts/:scope", (req, res) => {
  const prompt = aiPrompts.getPrompt(req.params.scope);
  res.json({ success: true, data: { scope: req.params.scope, prompt } });
});

router.get("/system-prompts", (req, res) => {
  res.json({ success: true, data: aiPrompts.listScopes() });
});

/**
 * 通用 SSE 流式对话（agent 的 fallback 端点）
 * POST /chat/stream
 * body: { platform, messages, options, attachments, roundId, tempApiKey, tempBaseUrl, tempModel }
 */
router.post("/chat/stream", async (req, res) => {
  const { platform, messages, options, attachments, roundId, tempApiKey, tempBaseUrl, tempModel } = req.body || {};
  if (!platform || !Array.isArray(messages)) {
    return res.status(400).json({ success: false, message: "platform / messages 必填" });
  }

  const { textOnlyAttachments, visionAttachments } = splitAttachments(attachments);
  if (textOnlyAttachments.length > 0) {
    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      const textBlock = textOnlyAttachments.map((a) => `\n\n--- 附件：${a.filename} ---\n${a.data}`).join('');
      last.content = (last.content || '') + textBlock;
    }
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders && res.flushHeaders();

  const sendEvent = (event, data) => {
    if (res.writableEnded || res.destroyed) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  };

  const ac = new AbortController();
  let clientClosed = false;
  req.on("close", () => { clientClosed = true; try { ac.abort(); } catch (_) {} });

  const heartbeat = setInterval(() => {
    if (clientClosed || res.writableEnded || res.destroyed) return;
    try { res.write(":keepalive\n\n"); } catch (_) {}
  }, 15000);

  let permit = null;
  try {
    permit = await aiConcurrency.acquire(platform, { signal: ac.signal });
  } catch (e) {
    clearInterval(heartbeat);
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({
          success: false, status: 429,
          message: e.message === "queue_full" ? "AI 服务繁忙，请稍后再试" : "请求已取消",
        })}\n\n`);
        res.end();
      } catch (_) {}
    }
    return;
  }
  sendEvent("queue_status", {
    inflight: aiConcurrency.getStats()[platform]?.inflight ?? null,
    waiting: aiConcurrency.getStats()[platform]?.waiting ?? null,
  });

  const cleanup = () => { clearInterval(heartbeat); if (permit) { permit.release(); permit = null; } };

  try {
    // 注入系统提示词
    const enhanced = messages;
    if (enhanced.length > 0 && enhanced[0].role === "system") {
      enhanced[0].content = BUILTIN_TOOLS_PROMPT + "\n\n" + enhanced[0].content;
    } else {
      enhanced.unshift({ role: "system", content: BUILTIN_TOOLS_PROMPT });
    }

    const result = await aiService.chatStream(
      platform, enhanced, options || {},
      (delta) => sendEvent("delta", { content: delta }),
      ac.signal, visionAttachments,
      tempApiKey ? { api_key: tempApiKey, base_url: tempBaseUrl, model_name: tempModel } : null,
    );
    sendEvent("done", { platform: result.platform, model: result.model });
    const usageRecord = aiService.recordUsage({
      sessionId: req.body?.sessionId || null, roundId: roundId || null,
      platform, model: result.model, usage: result.usage, source: 'stream',
    });
    if (usageRecord) sendEvent("usage", { ...usageRecord, sessionId: req.body?.sessionId || null, roundId: roundId || null });
    res.end();
  } catch (e) {
    if (!clientClosed) sendEvent("error", { message: e.message });
  } finally {
    cleanup();
  }
});

/**
 * Agent 端点（SSE 流式 + 服务端 <tool> 解析）
 * POST /agent?stream=1
 * body: { platform, messages, options, attachments, roundId, stream, tempApiKey, tempBaseUrl, tempModel }
 */
router.post("/agent", async (req, res) => {
  const {
    platform, messages, options, attachments,
    roundId, stream = false, tempApiKey, tempBaseUrl, tempModel,
  } = req.body || {};
  if (!platform || !Array.isArray(messages)) {
    return res.status(400).json({ success: false, message: "platform / messages 必填" });
  }

  const { textOnlyAttachments, visionAttachments } = splitAttachments(attachments);
  if (textOnlyAttachments.length > 0) {
    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      const textBlock = textOnlyAttachments.map((a) => `\n\n--- 附件：${a.filename} ---\n${a.data}`).join('');
      last.content = (last.content || '') + textBlock;
    }
  }

  // 注入系统提示词：内置工具提示 + agent tool 协议说明
  const agentSystemPrompt = [
    BUILTIN_TOOLS_PROMPT, '',
    '## Agent 工具调用协议',
    '当用户的需求需要调用工具才能完成时，用以下格式发起调用：',
    '<tool>name(args)</tool>',
    '- name 为工具名，args 为参数（多个参数以逗号分隔；无参数也要写 ()）',
    '- 一次回复里可以包含多个 <tool>，服务端会按出现顺序依次执行',
    '- 只有在确实没有合适工具时才走自然语言解释',
  ].join('\n');
  const enhanced = messages.slice();
  if (enhanced.length > 0 && enhanced[0].role === "system") {
    enhanced[0].content = agentSystemPrompt + "\n\n" + enhanced[0].content;
  } else {
    enhanced.unshift({ role: "system", content: agentSystemPrompt });
  }

  // 非流式分支
  if (!stream) {
    try {
      const result = await aiService.chat(
        platform, enhanced, options || {}, visionAttachments,
        tempApiKey ? { api_key: tempApiKey, base_url: tempBaseUrl, model_name: tempModel } : null,
      );
      const usageRecord = aiService.recordUsage({
        sessionId: req.body?.sessionId || null, roundId: roundId || null,
        platform, model: result.model, usage: result.usage, source: 'agent',
      });
      const { tools: toolCalls } = parseToolTags(result.content || '');
      res.json({ success: true, data: { ...result, toolCalls, usageRecord } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
    return;
  }

  // ============ Agent 流式分支 ============
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders && res.flushHeaders();

  const sendEvent = (event, data) => {
    if (res.writableEnded || res.destroyed) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  };

  const ac = new AbortController();
  let clientClosed = false;
  req.on("close", () => { clientClosed = true; try { ac.abort(); } catch (_) {} });

  const heartbeat = setInterval(() => {
    if (clientClosed || res.writableEnded || res.destroyed) return;
    try { res.write(":keepalive\n\n"); } catch (_) {}
  }, 15000);

  let permit = null;
  try {
    permit = await aiConcurrency.acquire(platform, { signal: ac.signal });
  } catch (e) {
    clearInterval(heartbeat);
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({
          success: false, status: 429,
          message: e.message === "queue_full" ? "AI 服务繁忙，请稍后再试" : "请求已取消",
        })}\n\n`);
        res.end();
      } catch (_) {}
    }
    return;
  }
  sendEvent("queue_status", {
    inflight: aiConcurrency.getStats()[platform]?.inflight ?? null,
    waiting: aiConcurrency.getStats()[platform]?.waiting ?? null,
  });

  const cleanup = () => { clearInterval(heartbeat); if (permit) { permit.release(); permit = null; } };

  try {
    const result = await aiService.chatStream(
      platform, enhanced, options || {},
      (delta) => sendEvent("delta", { content: delta }),
      ac.signal, visionAttachments,
      tempApiKey ? { api_key: tempApiKey, base_url: tempBaseUrl, model_name: tempModel } : null,
    );
    sendEvent("done", { platform: result.platform, model: result.model });
    const usageRecord = aiService.recordUsage({
      sessionId: req.body?.sessionId || null, roundId: roundId || null,
      platform, model: result.model, usage: result.usage, source: 'agent-stream',
    });
    const { tools: toolCalls } = parseToolTags(result.content || '');
    if (usageRecord) sendEvent("usage", { ...usageRecord, sessionId: req.body?.sessionId || null, roundId: roundId || null });
    if (toolCalls && toolCalls.length > 0) sendEvent("tool_calls", { toolCalls });
    res.end();
  } catch (e) {
    if (!clientClosed) sendEvent("error", { message: e.message });
  } finally {
    cleanup();
  }
});

// ============ 场景 AI 说明生成（URL 分享时附 markdown）============
router.post("/scene-description", async (req, res) => {
  const {
    platform, camera, snapshot, files = [], editorCode = "", style = "concise",
    tempApiKey, tempBaseUrl, tempModel,
  } = req.body || {};
  if (!platform) {
    return res.status(400).json({ success: false, message: "platform 必填" });
  }

  const camLine = camera
    ? `相机：经度 ${camera.lng?.toFixed?.(4)}°, 纬度 ${camera.lat?.toFixed?.(4)}°, 高度 ${(camera.height || 0).toFixed(0)}m, 朝向 ${(camera.heading || 0).toFixed(1)}°, 俯角 ${(camera.pitch || 0).toFixed(1)}°`
    : "相机：未提供";
  const filesLine = files.length
    ? files.slice(0, 8).map((f) => `- ${f.name || '?'}（${f.format || '?'}，${f.featureCount ?? '?'} 要素）`).join('\n')
    : "（无外部数据源）";

  const sysPrompt = `你是一个 GIS 场景说明助手。用户要把自己当前的 GIS 场景分享给同伴。
请基于下面提供的「相机 + 场景摘要 + 数据源 + 代码片段」生成一段中文 markdown 说明，要求：
- 100~300 字
- 用第二人称（"你将看到..."）描述这个场景长什么样、有什么要素、镜头在哪个区域
- 不要捏造相机/数据/字段；给不出就标"未知"
- 风格：${style === 'concise' ? '简洁直观，避免堆术语' : style === 'detail' ? '详细，列出每个图层' : '简洁直观'}
- 输出只包含 markdown 文本，不要套 \`\`\`markdown 包裹
- 如果场景空空如也（无 viewer / 无要素 / 相机默认），就礼貌提示"场景为空，可以加载数据后再分享"`;

  const userMsg = [
    camLine, '', '## 场景摘要', snapshot || '（未提供）', '', '## 数据源', filesLine,
    editorCode ? `\n## 当前编辑器代码（前 1500 字）\n\`\`\`js\n${String(editorCode).slice(0, 1500)}\n\`\`\`` : '',
  ].filter(Boolean).join('\n');

  try {
    const result = await aiService.chat(
      platform,
      [{ role: 'system', content: sysPrompt }, { role: 'user', content: userMsg }],
      { temperature: 0.5, max_tokens: 600 },
      [],
      tempApiKey ? { api_key: tempApiKey, base_url: tempBaseUrl, model_name: tempModel } : null,
    );
    const usageRecord = aiService.recordUsage({
      sessionId: req.body?.sessionId || null, roundId: req.body?.roundId || null,
      platform, model: result.model, usage: result.usage, source: 'scene-desc',
    });
    res.json({ success: true, data: { description: result.content || '', model: result.model, platform, usageRecord } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
