// server/services/agentOrchestrator.js
// 周期 15 R3: Multi-agent GIS Agent — planner + executor + verifier 架构
//
// 背景：
//   - 周期 7-14 GIS Agent 是单 agent + tool 模式（LLM 直接调用工具）
//   - 周期 14 调研 Top5 #3：GIS Copilot + GISclaw 采用 multi-agent 架构
//   - 周期 15 R3：升级为 planner + executor + verifier 三角色协作
//
// 设计：
//   - createPlannerAgent(opts)：把任务拆解为步骤列表
//   - createExecutorAgent(opts)：执行单个步骤
//   - createVerifierAgent(opts)：验证步骤结果
//   - runOrchestratedTask(task, opts)：完整流水线（plan → execute → verify → retry）
//
// 验收（tests/specs/agent-multi-agent.cjs ≥ 25 PASS）：
//   - 5 种 plan 场景（简单/复杂/失败/重试/终止）
//   - 3 种 executor 场景（成功/失败/超时）
//   - 3 种 verifier 场景（通过/失败/改进建议）
//   - 4 种 orchestrator 场景（完整流程/最大步骤/预算限制/错误传播）

'use strict';

// ---- 常量 ----
const MAX_PLAN_STEPS = 20;
const MAX_EXECUTOR_RETRIES = 3;
const MAX_VERIFIER_ITERATIONS = 2;
const DEFAULT_TIMEOUT_MS = 30000;

// ---- Agent 基类 ----

/**
 * 创建 planner agent
 * @param {object} opts
 * @param {Function} opts.llmCall - async (messages, opts) => result
 * @param {string} [opts.systemPrompt] - planner 系统提示词
 * @param {number} [opts.maxSteps=MAX_PLAN_STEPS] - 最大步骤数
 * @returns {Function} planner(task, context) => Promise<plan>
 */
function createPlannerAgent(opts = {}) {
  const llmCall = opts.llmCall;
  const systemPrompt = opts.systemPrompt || DEFAULT_PLANNER_PROMPT;
  const maxSteps = opts.maxSteps || MAX_PLAN_STEPS;

  if (typeof llmCall !== 'function') {
    throw new TypeError('createPlannerAgent: llmCall must be a function');
  }

  async function planner(task, context = {}) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: formatPlannerTask(task, context) },
    ];

    try {
      const result = await llmCall(messages, {
        temperature: 0.3,
        max_tokens: 2000,
      });
      const plan = parsePlan(result.content);
      // 限制步骤数
      if (plan.steps.length > maxSteps) {
        plan.steps = plan.steps.slice(0, maxSteps);
        plan.truncated = true;
      }
      return { ok: true, plan };
    } catch (e) {
      return { ok: false, error: e.message, plan: null };
    }
  }

  return planner;
}

/**
 * 创建 executor agent
 * @param {object} opts
 * @param {Function} opts.llmCall - async (messages, opts) => result
 * @param {Function} [opts.executeTool] - async (toolName, payload) => result
 * @param {string} [opts.systemPrompt] - executor 系统提示词
 * @param {number} [opts.timeoutMs=DEFAULT_TIMEOUT_MS] - 超时时间
 * @returns {Function} executor(step, context) => Promise<result>
 */
function createExecutorAgent(opts = {}) {
  const llmCall = opts.llmCall;
  const executeTool = opts.executeTool;
  const systemPrompt = opts.systemPrompt || DEFAULT_EXECUTOR_PROMPT;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (typeof llmCall !== 'function') {
    throw new TypeError('createExecutorAgent: llmCall must be a function');
  }

  async function executor(step, context = {}) {
    const startTime = Date.now();

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: formatExecutorStep(step, context) },
    ];

    try {
      // 使用 Promise.race 实现超时
      const llmPromise = llmCall(messages, {
        temperature: 0.5,
        max_tokens: 4000,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`executor_timeout:${timeoutMs}ms`)), timeoutMs)
      );

      const result = await Promise.race([llmPromise, timeoutPromise]);
      const elapsed = Date.now() - startTime;

      const parsed = parseExecutorResult(result.content);

      // 如果有工具调用，执行工具
      if (parsed.toolCall && executeTool) {
        try {
          const toolResult = await executeTool(parsed.toolCall.tool, parsed.toolCall.payload);
          parsed.toolResult = toolResult;
        } catch (e) {
          parsed.toolResult = { ok: false, error: e.message };
        }
      }

      parsed.elapsedMs = elapsed;
      return { ok: true, result: parsed };
    } catch (e) {
      return { ok: false, error: e.message, result: null };
    }
  }

  return executor;
}

/**
 * 创建 verifier agent
 * @param {object} opts
 * @param {Function} opts.llmCall - async (messages, opts) => result
 * @param {string} [opts.systemPrompt] - verifier 系统提示词
 * @returns {Function} verifier(step, result, context) => Promise<verification>
 */
function createVerifierAgent(opts = {}) {
  const llmCall = opts.llmCall;
  const systemPrompt = opts.systemPrompt || DEFAULT_VERIFIER_PROMPT;

  if (typeof llmCall !== 'function') {
    throw new TypeError('createVerifierAgent: llmCall must be a function');
  }

  async function verifier(step, result, context = {}) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: formatVerifierTask(step, result, context) },
    ];

    try {
      const llmResult = await llmCall(messages, {
        temperature: 0.2,
        max_tokens: 1000,
      });
      const verification = parseVerification(llmResult.content);
      return { ok: true, verification };
    } catch (e) {
      return { ok: false, error: e.message, verification: null };
    }
  }

  return verifier;
}

/**
 * 运行完整的 multi-agent 流水线
 * @param {object} task - { description, context }
 * @param {object} opts
 * @param {object} opts.agents - { planner, executor, verifier }
 * @param {number} [opts.maxSteps=MAX_PLAN_STEPS] - 最大执行步骤
 * @param {number} [opts.maxRetries=MAX_EXECUTOR_RETRIES] - 最大重试次数
 * @param {number} [opts.maxVerifierIterations=MAX_VERIFIER_ITERATIONS] - 最大验证迭代
 * @param {Function} [opts.onProgress] - (event, data) => void
 * @returns {Promise<object>} { ok, plan, results, errors, stats }
 */
async function runOrchestratedTask(task, opts = {}) {
  const { planner, executor, verifier } = opts.agents || {};
  const maxSteps = opts.maxSteps || MAX_PLAN_STEPS;
  const maxRetries = opts.maxRetries || MAX_EXECUTOR_RETRIES;
  const maxVerifierIterations = opts.maxVerifierIterations || MAX_VERIFIER_ITERATIONS;
  const onProgress = opts.onProgress || (() => {});

  if (!planner || !executor) {
    return { ok: false, error: 'planner and executor are required', plan: null, results: [], errors: [], stats: {} };
  }

  const stats = { planned: 0, executed: 0, verified: 0, retried: 0, elapsedMs: 0 };
  const startTime = Date.now();
  const results = [];
  const errors = [];

  // 1. Plan
  onProgress('planning', { task });
  const planResult = await planner(task.description || task, task.context || {});
  if (!planResult.ok || !planResult.plan) {
    return { ok: false, error: planResult.error, plan: null, results, errors: [planResult.error], stats };
  }
  const plan = planResult.plan;
  stats.planned = plan.steps.length;
  onProgress('plan_complete', { stepCount: plan.steps.length });

  // 2. Execute + Verify loop
  for (let i = 0; i < plan.steps.length && i < maxSteps; i++) {
    const step = plan.steps[i];
    let stepOk = false;
    let lastError = null;
    let lastResult = null;

    // Executor retry loop
    for (let retry = 0; retry < maxRetries; retry++) {
      if (retry > 0) {
        stats.retried += 1;
        step.context = { ...step.context, retry: true, retryCount: retry, previousError: lastError };
        onProgress('retrying', { stepIndex: i, retryCount: retry });
      }

      onProgress('executing', { stepIndex: i, step });
      const execResult = await executor(step, task.context || {});
      stats.executed += 1;
      lastResult = execResult;

      if (execResult.ok && execResult.result) {
        // 3. Verify (if verifier available)
        if (verifier && execResult.result.output) {
          onProgress('verifying', { stepIndex: i });
          const verifyResult = await verifier(step, execResult.result, task.context || {});
          stats.verified += 1;

          if (verifyResult.ok && verifyResult.verification) {
            const v = verifyResult.verification;
            if (v.pass) {
              stepOk = true;
              results.push({ stepIndex: i, step, result: execResult.result, verification: v });
              onProgress('step_complete', { stepIndex: i, pass: true });
              break;
            } else if (retry < maxRetries - 1) {
              lastError = v.feedback || 'verification_failed';
              // 继续重试
            } else {
              // 达到最大重试，记录结果但标记为未通过验证
              results.push({ stepIndex: i, step, result: execResult.result, verification: v, verificationFailed: true });
              stepOk = true; // 不继续重试
              onProgress('step_complete', { stepIndex: i, pass: false, feedback: lastError });
              break;
            }
          }
        } else {
          // 无 verifier 或无 output，直接接受
          stepOk = true;
          results.push({ stepIndex: i, step, result: execResult.result, verification: null });
          onProgress('step_complete', { stepIndex: i, pass: true });
          break;
        }
      } else {
        lastError = execResult.error || 'execution_failed';
      }
    }

    if (!stepOk) {
      const errorMsg = lastError || 'step_failed';
      errors.push({ stepIndex: i, error: errorMsg });
      results.push({ stepIndex: i, step, result: lastResult, error: errorMsg });
      onProgress('step_failed', { stepIndex: i, error: errorMsg });
    }
  }

  stats.elapsedMs = Date.now() - startTime;
  const success = errors.length === 0;
  return { ok: success, plan, results, errors, stats };
}

// ---- 默认系统提示词 ----

const DEFAULT_PLANNER_PROMPT = `You are a GIS task planner. Break down the user's task into a sequence of executable steps.

Output format (JSON):
{
  "steps": [
    {
      "description": "Step description",
      "tool": "tool_name (optional)",
      "parameters": { "key": "value" },
      "context": { "hint": "optional context" }
    }
  ]
}`;

const DEFAULT_EXECUTOR_PROMPT = `You are a GIS task executor. Execute the given step and produce a result.

If the step requires a tool, output a JSON tool call:
{
  "toolCall": { "tool": "tool_name", "payload": { "key": "value" } },
  "output": "description of what you did"
}

If no tool is needed:
{
  "output": "your result here"
}`;

const DEFAULT_VERIFIER_PROMPT = `You are a GIS task verifier. Check if the executor's result correctly fulfills the step's goal.

Output format (JSON):
{
  "pass": true/false,
  "feedback": "if failed, explain what's wrong and how to fix",
  "score": 0-100
}`;

// ---- 辅助函数 ----

function formatPlannerTask(task, context) {
  let msg = `Task: ${task}\n`;
  if (context && Object.keys(context).length > 0) {
    msg += `\nContext:\n${JSON.stringify(context, null, 2)}`;
  }
  return msg;
}

function formatExecutorStep(step, context) {
  let msg = `Step: ${step.description}\n`;
  if (step.tool) msg += `Tool: ${step.tool}\n`;
  if (step.parameters) msg += `Parameters: ${JSON.stringify(step.parameters)}\n`;
  if (context && Object.keys(context).length > 0) {
    msg += `\nContext:\n${JSON.stringify(context, null, 2)}`;
  }
  return msg;
}

function formatVerifierTask(step, result, context) {
  let msg = `Step: ${step.description}\n`;
  msg += `Result: ${JSON.stringify(result, null, 2)}\n`;
  if (context && Object.keys(context).length > 0) {
    msg += `\nContext:\n${JSON.stringify(context, null, 2)}`;
  }
  return msg;
}

function parsePlan(content) {
  try {
    const json = extractJson(content);
    return {
      steps: Array.isArray(json.steps) ? json.steps : [],
      truncated: !!json.truncated,
    };
  } catch (_) {
    return { steps: [], error: 'parse_failed' };
  }
}

function parseExecutorResult(content) {
  try {
    const json = extractJson(content);
    return {
      toolCall: json.toolCall || null,
      output: json.output || content,
    };
  } catch (_) {
    return { toolCall: null, output: content };
  }
}

function parseVerification(content) {
  try {
    const json = extractJson(content);
    return {
      pass: json.pass !== false,
      feedback: json.feedback || '',
      score: typeof json.score === 'number' ? json.score : null,
    };
  } catch (_) {
    return { pass: true, feedback: '', score: null };
  }
}

function extractJson(content) {
  if (typeof content !== 'string') return {};
  // Try direct parse
  try {
    return JSON.parse(content);
  } catch (_) {}
  // Try extracting from markdown code block
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch (_) {}
  }
  // Try finding JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (_) {}
  }
  return {};
}

module.exports = {
  createPlannerAgent,
  createExecutorAgent,
  createVerifierAgent,
  runOrchestratedTask,
  MAX_PLAN_STEPS,
  MAX_EXECUTOR_RETRIES,
  MAX_VERIFIER_ITERATIONS,
  DEFAULT_TIMEOUT_MS,
  // Internal helpers for testing
  _internal: {
    parsePlan,
    parseExecutorResult,
    parseVerification,
    extractJson,
    formatPlannerTask,
    formatExecutorStep,
    formatVerifierTask,
    DEFAULT_PLANNER_PROMPT,
    DEFAULT_EXECUTOR_PROMPT,
    DEFAULT_VERIFIER_PROMPT,
  },
};
