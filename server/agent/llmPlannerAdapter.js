// server/agent/llmPlannerAdapter.js
// 周期 16 P0-1: LLM planner 适配层（接真实 LLM 产出 steps → 复用 multiAgentPlanner 的 execute/verify 门禁）
//
// 设计（对应 R-1501 / cycle-15-multiagent-integration.md「下一轮接 LLM planner 的路径」）：
//   保留 executor / verifier 不变，仅把 planner 换成「LLM 产出 steps JSON →
//   normalizeStep + detectCycle + 白名单校验」的适配层。
//
// 关键约束：
//   - LLM 通过注入的 llmChat 抽象调用（默认 ai.chat），本模块不硬编码密钥/平台/baseUrl。
//   - 解析健壮：容忍 ```json 围栏 / 前后散文 / 单步对象 / steps 包裹等多种返回形态。
//   - 危险操作仍走 HITL（由 multiAgentPlanner executor 强制），适配层不绕过。
//   - JSON 解析失败 / 步骤非法 / 命中白名单外 → 抛结构化错误，不静默降级。

'use strict';

const path = require('node:path');

const {
  normalizeStep,
  detectCycle,
  DEFAULT_MAX_STEPS,
} = require(path.join(__dirname, './multiAgentPlanner'));

/** 构造 planner system prompt（要求只返回 JSON steps 数组） */
function buildPlannerPrompt(goal, toolCatalog) {
  const toolLines = Object.values(toolCatalog || {}).map((t) => ({
    name: t.name,
    description: t.description || '',
    capability: t.capability || '',
    phase: t.phase || 'act',
    dangerous: t.dangerous === true,
  }));
  return [
    '你是 GIS Agent 的 planner。把用户目标分解为有序、可执行的步骤 DAG。',
    '只能使用下列工具（name 必须精确匹配）：',
    JSON.stringify(toolLines, null, 0),
    '输出要求：只返回一个 JSON 对象，形如 {"steps":[{"id","tool","args","dependsOn","phase","verify"}]}，',
    '不要输出任何解释性文字。id 唯一；dependsOn 引用已有 id；无依赖则为 []。',
    '危险工具（dangerous=true）会被 HITL 拦截，请谨慎使用。',
    '用户目标：' + (typeof goal === 'string' ? goal : JSON.stringify(goal)),
  ].join('\n');
}

/**
 * 从 LLM 返回文本中提取 steps 数组。容忍围栏/散文/包裹。
 * @returns {Array<object>} 原始 steps
 */
function extractSteps(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('llm_planner: LLM 返回为空');
  }
  let raw = text.trim();

  // 去掉 ```json ... ``` 或 ``` ... ``` 围栏
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();

  // 若是单步对象（含 tool 且无 steps），包一层
  function tryParse(s) {
    try { return JSON.parse(s); } catch (_) { return undefined; }
  }

  // 优先直接解析
  let parsed = tryParse(raw);

  // 失败则截取第一个 { 到最后一个 } 之间
  if (parsed === undefined) {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      parsed = tryParse(raw.slice(first, last + 1));
    }
  }
  // 再失败截取第一个 [ 到最后一个 ] 之间（纯数组）
  if (parsed === undefined) {
    const first = raw.indexOf('[');
    const last = raw.lastIndexOf(']');
    if (first !== -1 && last !== -1 && last > first) {
      parsed = tryParse(raw.slice(first, last + 1));
    }
  }
  if (parsed === undefined) {
    throw new Error('llm_planner: 无法从 LLM 返回解析 JSON');
  }

  // 归一化为 steps 数组
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.steps)) return parsed.steps;
  if (parsed && typeof parsed === 'object' && parsed.tool) return [parsed];
  throw new Error('llm_planner: LLM 返回缺少 steps 数组');
}

/**
 * 创建 LLM planner 适配器。
 * @param {object} config
 * @param {Record<string, object>} config.tools 工具目录（同 multiAgentPlanner）
 * @param {Function} [config.llmChat] async ({ platform, messages, options }) => { content }
 * @param {string} [config.platform] 默认平台（缺省时由 llmChat 自行决定或抛错）
 * @param {object} [config.llmOptions] 透传给 llmChat 的 options（model/temperature 等）
 * @param {string[]} [config.allowlist] 工具白名单
 * @param {number} [config.maxSteps]
 */
function createLlmPlannerAdapter(config = {}) {
  const tools = config.tools && typeof config.tools === 'object' ? config.tools : {};
  const allowlist = Array.isArray(config.allowlist) ? config.allowlist : null;
  const maxSteps = Number.isInteger(config.maxSteps) && config.maxSteps > 0 ? config.maxSteps : DEFAULT_MAX_STEPS;
  // llmChat: 注入抽象；未注入时延迟加载 ai.chat（延迟到调用期，
  //   避免在注入 llmChat 的场景下加载 ai.js 及其可选网络依赖；平台由调用方给）
  const injectedChat = typeof config.llmChat === 'function' ? config.llmChat : null;
  const platform = config.platform;
  async function defaultChat({ messages, options }) {
    const ai = require(path.join(__dirname, '../services/ai'));
    return ai.chat(platform, messages, options || {});
  }
  const llmChat = injectedChat || defaultChat;

  /**
   * 用 LLM 生成并校验计划（返回与 multiAgentPlanner.plan 同构的 planResult）。
   * @param {object|string} goal
   * @returns {Promise<{goal, steps, createdAt, source:'llm'}>}
   */
  async function plan(goal) {
    const messages = [
      { role: 'system', content: buildPlannerPrompt(goal, tools) },
      { role: 'user', content: typeof goal === 'string' ? goal : JSON.stringify(goal) },
    ];
    const resp = await llmChat({ platform: config.platform, messages, options: config.llmOptions || {} });
    const content = resp && typeof resp.content === 'string' ? resp.content : '';
    const rawSteps = extractSteps(content);

    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
      throw new Error('llm_planner: 计划为空');
    }
    if (rawSteps.length > maxSteps) {
      throw new Error(`llm_planner: 步骤数 ${rawSteps.length} 超过上限 ${maxSteps}`);
    }

    // 复用 multiAgentPlanner 的规范化 + 环检测 + 白名单门禁
    const steps = rawSteps.map(normalizeStep);
    const graph = new Map(steps.map((s) => [s.id, s.dependsOn]));
    for (const s of steps) {
      for (const d of s.dependsOn) {
        if (!graph.has(d)) throw new Error(`llm_planner: ${s.id} 依赖未知步骤 ${d}`);
      }
    }
    const cyclic = detectCycle(graph);
    if (cyclic) throw new Error(`llm_planner: 检测到依赖环，涉及 ${cyclic}`);
    if (allowlist) {
      for (const s of steps) {
        if (!allowlist.includes(s.tool)) throw new Error(`llm_planner: tool_not_in_allowlist:${s.tool}`);
      }
    }
    return { goal, steps, createdAt: new Date().toISOString(), source: 'llm' };
  }

  return { plan, tools: Object.keys(tools) };
}

module.exports = {
  createLlmPlannerAdapter,
  buildPlannerPrompt,
  extractSteps,
};