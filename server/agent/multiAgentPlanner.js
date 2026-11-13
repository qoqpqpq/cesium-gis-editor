// server/agent/multiAgentPlanner.js
// 周期 15 P0-1: Multi-agent GIS Agent 骨架（planner + executor + verifier）
//
// 设计目标（对应 docs/cycles/cycle-14-research.md 调研 Top1）：
//   把「单 agent + tool」升级为「planner + executor + verifier」三角色协作骨架，
//   为后续接入真实 LLM planner 留出接口。本模块本身确定性、可单测，不依赖网络/LLM。
//
// 三角色：
//   - planner  : 把高层 goal（capabilities / 显式 steps）编排成带依赖的 DAG 计划
//   - executor : 依赖感知执行 DAG（独立步骤并行、失败阻断下游、危险操作 HITL 门）
//   - verifier : 按 step.verify 契约校验执行产物，产出结构化校验报告
//
// 复用 server/middleware/aiGuardrails.js 的 allowlist / dangerous-HITL 语义（ASI02/ASI09）。
//
// 安全约束：不引入硬编码密钥/本地路径；不修改对外接口；纯增量模块。

'use strict';

/** 阶段优先级（越小越先执行），用于 planner 排序 */
const PHASE_ORDER = { prepare: 0, act: 1, capture: 2, finalize: 3 };

/** 默认危险操作清单（与 aiGuardrails 对齐） */
const DEFAULT_DANGEROUS_ACTIONS = ['delete', 'drop', 'dropTable', 'execute', 'rm', 'payment'];

/** 单计划步骤上限，防御 planner 无界膨胀 */
const DEFAULT_MAX_STEPS = 32;

/**
 * 校验并规范化单个步骤
 * @param {object} step
 * @param {number} index
 * @returns {object} 规范化后的 step
 */
function normalizeStep(step, index) {
  if (!step || typeof step !== 'object') {
    throw new Error(`invalid_step: index ${index} 不是对象`);
  }
  if (typeof step.id !== 'string' || !step.id) {
    throw new Error(`invalid_step: index ${index} 缺少 id`);
  }
  if (typeof step.tool !== 'string' || !step.tool) {
    throw new Error(`invalid_step: ${step.id} 缺少 tool`);
  }
  const dependsOn = Array.isArray(step.dependsOn) ? step.dependsOn.slice() : [];
  const args = step.args && typeof step.args === 'object' ? { ...step.args } : {};
  const verify = step.verify && typeof step.verify === 'object' ? { ...step.verify } : null;
  return {
    id: step.id,
    tool: step.tool,
    args,
    dependsOn,
    verify,
    phase: typeof step.phase === 'string' ? step.phase : 'act',
  };
}

/**
 * 检测 DAG 中的环（DFS 染色）
 * @param {Map<string, string[]>} graph id -> dependsOn
 * @returns {string|null} 环中任一节点 id，无环返回 null
 */
function detectCycle(graph) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const id of graph.keys()) color.set(id, WHITE);

  function visit(id) {
    color.set(id, GRAY);
    const deps = graph.get(id) || [];
    for (const d of deps) {
      if (!graph.has(d)) continue; // 未知依赖在别处报错
      if (color.get(d) === GRAY) return d;
      if (color.get(d) === WHITE) {
        const found = visit(d);
        if (found) return found;
      }
    }
    color.set(id, BLACK);
    return null;
  }

  for (const id of graph.keys()) {
    if (color.get(id) === WHITE) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 创建 Multi-agent 编排器（planner + executor + verifier）
 * @param {object} config
 * @param {Record<string, object>} config.tools 工具目录 name -> { description, inputSchema, capability, phase, dangerous }
 * @param {string[]} [config.allowlist] 工具白名单；null/缺省 = 不限制
 * @param {string[]} [config.dangerousActionsRequireHITL] 危险操作清单
 * @param {(step: object) => Promise<boolean>|boolean} [config.onConfirm] HITL 确认回调
 * @param {number} [config.maxSteps]
 */
function createMultiAgentOrchestrator(config = {}) {
  const tools = config.tools && typeof config.tools === 'object' ? config.tools : {};
  const allowlist = Array.isArray(config.allowlist) ? config.allowlist : null;
  const dangerousActions = Array.isArray(config.dangerousActionsRequireHITL)
    ? config.dangerousActionsRequireHITL
    : DEFAULT_DANGEROUS_ACTIONS;
  const onConfirm = typeof config.onConfirm === 'function' ? config.onConfirm : null;
  const maxSteps = Number.isInteger(config.maxSteps) && config.maxSteps > 0 ? config.maxSteps : DEFAULT_MAX_STEPS;

  /**
   * planner：把 goal 编排成 DAG 计划
   * goal 形态一：{ steps: [...] } 显式步骤
   * goal 形态二：{ capabilities: [...], args?: { toolName: {...} } } 按能力编排
   */
  function plan(goal) {
    if (!goal || typeof goal !== 'object') {
      throw new Error('plan: goal 必须是对象');
    }

    let rawSteps;
    if (Array.isArray(goal.steps)) {
      rawSteps = goal.steps;
    } else if (Array.isArray(goal.capabilities)) {
      // 按 capability 选工具，按 phase 排序，组装 steps
      const wanted = new Set(goal.capabilities);
      const capArgs = goal.args && typeof goal.args === 'object' ? goal.args : {};
      rawSteps = Object.entries(tools)
        .filter(([, t]) => t && typeof t === 'object' && wanted.has(t.capability))
        .map(([, t]) => ({
          id: `step_${t.name}`,
          tool: t.name,
          args: capArgs[t.name] && typeof capArgs[t.name] === 'object' ? { ...capArgs[t.name] } : {},
          phase: typeof t.phase === 'string' ? t.phase : 'act',
          dependsOn: [],
        }))
        .sort((a, b) => {
          const ra = PHASE_ORDER[a.phase] ?? PHASE_ORDER.act;
          const rb = PHASE_ORDER[b.phase] ?? PHASE_ORDER.act;
          return ra - rb;
        });
    } else {
      throw new Error('plan: goal 需要 steps 或 capabilities');
    }

    if (rawSteps.length === 0) {
      throw new Error('plan: 计划为空');
    }
    if (rawSteps.length > maxSteps) {
      throw new Error(`plan: 步骤数 ${rawSteps.length} 超过上限 ${maxSteps}`);
    }

    const steps = rawSteps.map(normalizeStep);

    // 依赖合法性 + 环检测
    const graph = new Map();
    for (const s of steps) graph.set(s.id, s.dependsOn);
    for (const s of steps) {
      for (const d of s.dependsOn) {
        if (!graph.has(d)) {
          throw new Error(`plan: ${s.id} 依赖未知步骤 ${d}`);
        }
      }
    }
    const cyclic = detectCycle(graph);
    if (cyclic) {
      throw new Error(`plan: 检测到依赖环，涉及 ${cyclic}`);
    }

    // 白名单检查（planner 期即拦截，fail-fast）
    if (allowlist) {
      for (const s of steps) {
        if (!allowlist.includes(s.tool)) {
          throw new Error(`plan: tool_not_in_allowlist:${s.tool}`);
        }
      }
    }

    return { goal, steps, createdAt: new Date().toISOString() };
  }

  /**
   * executor：依赖感知执行 DAG。独立步骤并行，失败阻断下游，危险操作走 HITL。
   * @param {object} planResult plan() 的返回
   * @param {Record<string, (args: object) => Promise<any>|any>} handlers tool name -> handler
   */
  async function execute(planResult, handlers) {
    if (!planResult || !Array.isArray(planResult.steps)) {
      throw new Error('execute: planResult 非法');
    }
    const h = handlers && typeof handlers === 'object' ? handlers : {};
    const steps = planResult.steps;
    const byId = new Map(steps.map((s) => [s.id, s]));
    const results = new Map(); // id -> { id, tool, status, result, error, skippedBy }
    const order = []; // 完成顺序

    function dependsSatisfied(step) {
      return step.dependsOn.every((d) => results.get(d) && results.get(d).status === 'completed');
    }

    function blockedBy(step) {
      for (const d of step.dependsOn) {
        const r = results.get(d);
        if (!r || r.status !== 'completed') return d;
      }
      return null;
    }

    // 迭代推进：每轮找出「依赖已满足且未执行」的步骤并行执行，直到无进展
    let progress = true;
    while (progress) {
      progress = false;
      const ready = [];
      for (const s of steps) {
        if (results.has(s.id)) continue;
        if (dependsSatisfied(s)) {
          ready.push(s);
        } else {
          const blocker = blockedBy(s);
          // 若某依赖已终态但非 completed，标记本步被跳过
          if (blocker && results.has(blocker) && results.get(blocker).status !== 'completed') {
            results.set(s.id, {
              id: s.id, tool: s.tool, status: 'skipped',
              result: null, error: `upstream_failed:${blocker}`, skippedBy: blocker,
            });
            order.push(s.id);
            progress = true;
          }
        }
      }

      if (ready.length > 0) {
        await Promise.all(ready.map(async (s) => {
          // HITL 门
          const isDangerous = dangerousActions.includes(s.tool) ||
            (tools[s.tool] && tools[s.tool].dangerous === true);
          if (isDangerous) {
            if (!onConfirm) {
              results.set(s.id, {
                id: s.id, tool: s.tool, status: 'blocked',
                result: null, error: `dangerous_action_requires_hitl:${s.tool}`, skippedBy: null,
              });
              order.push(s.id);
              progress = true;
              return;
            }
            let confirmed = false;
            try {
              confirmed = await onConfirm(s);
            } catch (e) {
              confirmed = false;
              s.__confirmError = e.message;
            }
            if (!confirmed) {
              results.set(s.id, {
                id: s.id, tool: s.tool, status: 'blocked',
                result: null, error: s.__confirmError
                  ? `hitl_confirm_error:${s.__confirmError}`
                  : `hitl_rejected:${s.tool}`, skippedBy: null,
              });
              order.push(s.id);
              progress = true;
              return;
            }
          }

          const handler = h[s.tool];
          if (typeof handler !== 'function') {
            results.set(s.id, {
              id: s.id, tool: s.tool, status: 'failed',
              result: null, error: `handler_not_found:${s.tool}`, skippedBy: null,
            });
            order.push(s.id);
            progress = true;
            return;
          }
          try {
            const out = await handler(s.args);
            results.set(s.id, {
              id: s.id, tool: s.tool, status: 'completed', result: out, error: null, skippedBy: null,
            });
          } catch (e) {
            results.set(s.id, {
              id: s.id, tool: s.tool, status: 'failed',
              result: null, error: e && e.message ? e.message : String(e), skippedBy: null,
            });
          }
          order.push(s.id);
          progress = true;
        }));
      }
    }

    // 保证每个步骤都有结果记录（防御遗漏）
    for (const s of steps) {
      if (!results.has(s.id)) {
        results.set(s.id, {
          id: s.id, tool: s.tool, status: 'skipped',
          result: null, error: 'not_scheduled', skippedBy: null,
        });
        order.push(s.id);
      }
    }

    const records = steps.map((s) => results.get(s.id));
    const completed = records.filter((r) => r.status === 'completed').length;
    const failed = records.filter((r) => r.status === 'failed').length;
    const blocked = records.filter((r) => r.status === 'blocked').length;
    const skipped = records.filter((r) => r.status === 'skipped').length;
    return { records, order, summary: { total: records.length, completed, failed, blocked, skipped } };
  }

  /**
   * verifier：按 step.verify 契约校验执行产物
   * 契约形态：{ required?: string[], type?: 'object'|'array'|'string'|'number'|'boolean'|'null'|'any', equals?: any }
   */
  function verify(planResult, execution) {
    if (!planResult || !Array.isArray(planResult.steps)) throw new Error('verify: planResult 非法');
    if (!execution || !Array.isArray(execution.records)) throw new Error('verify: execution 非法');
    const recById = new Map(execution.records.map((r) => [r.id, r]));

    const checks = planResult.steps.map((s) => {
      const rec = recById.get(s.id);
      if (!rec) return { stepId: s.id, ok: false, reason: 'no_execution_record' };
      if (rec.status !== 'completed') {
        return { stepId: s.id, ok: false, reason: `step_${rec.status}` };
      }
      const contract = s.verify;
      if (!contract) return { stepId: s.id, ok: true, reason: 'no_contract' };

      const result = rec.result;
      if (contract.type && contract.type !== 'any') {
        const actual = Array.isArray(result) ? 'array' : result === null ? 'null' : typeof result;
        if (actual !== contract.type) {
          return { stepId: s.id, ok: false, reason: `type_mismatch:expected=${contract.type},actual=${actual}` };
        }
      }
      if (Array.isArray(contract.required)) {
        if (result === null || typeof result !== 'object') {
          return { stepId: s.id, ok: false, reason: 'required_on_non_object' };
        }
        const missing = contract.required.filter((k) => !(k in result));
        if (missing.length > 0) {
          return { stepId: s.id, ok: false, reason: `missing_keys:${missing.join(',')}` };
        }
      }
      if (Object.prototype.hasOwnProperty.call(contract, 'equals')) {
        const a = JSON.stringify(result);
        const b = JSON.stringify(contract.equals);
        if (a !== b) return { stepId: s.id, ok: false, reason: `equals_mismatch:expected=${b},actual=${a}` };
      }
      return { stepId: s.id, ok: true, reason: 'ok' };
    });

    const passed = checks.filter((c) => c.ok).length;
    return {
      checks,
      summary: { total: checks.length, passed, failed: checks.length - passed },
      ok: passed === checks.length,
    };
  }

  /**
   * run：plan -> execute -> verify 一站式
   */
  async function run(goal, handlers, runOpts = {}) {
    const planResult = plan(goal);
    const execution = await execute(planResult, handlers);
    const verification = verify(planResult, execution);
    let status = 'completed';
    if (execution.summary.blocked > 0) status = 'blocked';
    else if (execution.summary.failed > 0) status = 'failed';
    if (runOpts.requireAllVerified && !verification.ok) status = status === 'completed' ? 'failed' : status;
    return { plan: planResult, execution, verification, status };
  }

  return { plan, execute, verify, run, tools: Object.keys(tools) };
}

module.exports = {
  createMultiAgentOrchestrator,
  normalizeStep,
  detectCycle,
  PHASE_ORDER,
  DEFAULT_DANGEROUS_ACTIONS,
  DEFAULT_MAX_STEPS,
};