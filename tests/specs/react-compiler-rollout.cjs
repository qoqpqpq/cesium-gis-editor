// tests/specs/react-compiler-rollout.cjs
// 周期 15 R6: React 19 Compiler 启用 + useActionState 真实集成
// 目标：≥ 15 PASS
//
// 覆盖：
//   - 模块导出
//   - createCompilerConfig（配置 / 兼容性 / 依赖 / 有效性）
//   - analyzeComponent（分析 / 推荐）
//   - generateMigrationReport（迁移报告）
//   - createActionState（状态机 / dispatch / reset / history）
//   - createFormState（表单状态机 / setField / submit / reset）

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createCompilerConfig,
  analyzeComponent,
  generateMigrationReport,
} = require(path.join(__dirname, '../../server/services/reactCompiler'));

const {
  createActionState,
  createFormState,
} = require(path.join(__dirname, '../../server/services/useActionState'));

let pass = 0;
let fail = 0;

function ok(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      console.log(`  [PASS] ${label}`);
    })
    .catch((e) => {
      fail += 1;
      console.error(`  [FAIL] ${label}: ${e.message}`);
    });
}

(async function main() {
  console.log('=== react-compiler-rollout ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: createCompilerConfig 已导出', () => {
    assert.equal(typeof createCompilerConfig, 'function');
  });
  await ok('A2: analyzeComponent 已导出', () => {
    assert.equal(typeof analyzeComponent, 'function');
  });
  await ok('A3: generateMigrationReport 已导出', () => {
    assert.equal(typeof generateMigrationReport, 'function');
  });
  await ok('A4: createActionState 已导出', () => {
    assert.equal(typeof createActionState, 'function');
  });
  await ok('A5: createFormState 已导出', () => {
    assert.equal(typeof createFormState, 'function');
  });

  // ============ Group B: createCompilerConfig ============
  await ok('B1: 基本创建', () => {
    const config = createCompilerConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.target, 'react-compiler');
    assert.equal(config.reactVersion, '19.0.0');
  });
  await ok('B2: 禁用配置', () => {
    const config = createCompilerConfig({ enabled: false });
    assert.equal(config.enabled, false);
    const plugin = config.vitePlugin();
    assert.equal(plugin.name, 'react-compiler-disabled');
  });
  await ok('B3: React 18.2 不兼容', () => {
    const config = createCompilerConfig({ reactVersion: '18.2.0' });
    assert.equal(config.isCompatible(), false);
    const valid = config.isValid();
    assert.equal(valid.valid, false);
    assert.ok(valid.errors.length > 0);
  });
  await ok('B4: React 19.0 兼容', () => {
    const config = createCompilerConfig({ reactVersion: '19.0.0' });
    assert.equal(config.isCompatible(), true);
    const valid = config.isValid();
    assert.equal(valid.valid, true);
  });
  await ok('B5: React 18.3 兼容', () => {
    const config = createCompilerConfig({ reactVersion: '18.3.0' });
    assert.equal(config.isCompatible(), true);
  });
  await ok('B6: getDependencies 返回依赖列表', () => {
    const config = createCompilerConfig({ reactVersion: '19.0.0' });
    const deps = config.getDependencies();
    assert.ok(deps.react.includes('19.0.0'));
    assert.ok(deps['babel-plugin-react-compiler']);
    assert.ok(deps['@vitejs/plugin-react']);
  });
  await ok('B7: vitePlugin 返回 Babel 配置', () => {
    const config = createCompilerConfig({ enabled: true });
    const plugin = config.vitePlugin();
    assert.equal(plugin.name, '@vitejs/plugin-react-compiler');
    assert.ok(typeof plugin.babel === 'function');
    const babelConfig = plugin.babel();
    assert.ok(babelConfig.plugins.length > 0);
  });

  // ============ Group C: analyzeComponent ============
  await ok('C1: 纯组件（无需 memo）', () => {
    const r = analyzeComponent('PureComponent', { hasProps: false, isPure: true });
    assert.equal(r.needsMemo, false);
    assert.equal(r.recommendation, 'no action needed');
  });
  await ok('C2: 有 props 的非纯组件（需要 memo）', () => {
    const r = analyzeComponent('InteractiveComponent', { hasProps: true, isPure: false, renderCount: 5 });
    assert.equal(r.needsMemo, true);
    assert.equal(r.recommendation, 'use React Compiler');
    assert.equal(r.estimatedBenefit.renderReduction, '80%');
  });
  await ok('C3: 有副作用的组件（不能自动优化）', () => {
    const r = analyzeComponent('EffectComponent', { hasProps: true, isPure: false, hasEffects: true });
    assert.equal(r.canUseCompiler, false);
  });
  await ok('C4: 有状态的组件（可以优化）', () => {
    const r = analyzeComponent('StatefulComponent', { hasProps: true, isPure: false, hasEffects: true, hasState: true });
    assert.equal(r.canUseCompiler, true);
  });

  // ============ Group D: generateMigrationReport ============
  await ok('D1: 空组件列表', () => {
    const report = generateMigrationReport([]);
    assert.equal(report.summary.totalComponents, 0);
    assert.equal(report.summary.needsMigration, 0);
    assert.ok(report.recommendations.length > 0);
  });
  await ok('D2: 混合组件列表', () => {
    const report = generateMigrationReport([
      { name: 'Pure', hasProps: false, isPure: true },
      { name: 'Interactive', hasProps: true, isPure: false, renderCount: 3 },
      { name: 'Stateful', hasProps: true, isPure: false, hasEffects: true, hasState: true },
    ]);
    assert.equal(report.summary.totalComponents, 3);
    assert.equal(report.summary.needsMigration, 2); // Interactive + Stateful
    assert.ok(report.summary.canUseCompiler >= 2);
  });
  await ok('D3: 推荐列表包含关键步骤', () => {
    const report = generateMigrationReport([
      { name: 'Test', hasProps: true, isPure: false },
    ]);
    const recs = report.recommendations.join(' ');
    assert.ok(recs.includes('19.0.0'));
    assert.ok(recs.includes('babel-plugin-react-compiler'));
  });

  // ============ Group E: createActionState ============
  await ok('E1: 基本创建 + 初始状态', () => {
    const state = createActionState({
      initialState: 0,
      action: (prev, delta) => prev + delta,
    });
    assert.equal(state.getValue(), 0);
    assert.equal(state.isPending(), false);
    assert.equal(state.hasError(), false);
  });
  await ok('E2: dispatch 成功', async () => {
    const state = createActionState({
      initialState: 0,
      action: (prev, delta) => prev + delta,
    });
    const r = await state.dispatch(5);
    assert.equal(r.ok, true);
    assert.equal(r.state, 5);
    assert.equal(state.getValue(), 5);
  });
  await ok('E3: dispatch 多次', async () => {
    const state = createActionState({
      initialState: 0,
      action: (prev, delta) => prev + delta,
    });
    await state.dispatch(1);
    await state.dispatch(2);
    await state.dispatch(3);
    assert.equal(state.getValue(), 6);
    assert.equal(state.getHistory().length, 4); // 初始 + 3 次
  });
  await ok('E4: dispatch 错误处理', async () => {
    const state = createActionState({
      initialState: 0,
      action: async (prev, delta) => {
        if (delta === 'error') throw new Error('boom');
        return prev + delta;
      },
    });
    const r = await state.dispatch('error');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'boom');
    assert.equal(state.hasError(), true);
    assert.equal(state.getError(), 'boom');
  });
  await ok('E5: reset 恢复初始状态', async () => {
    const state = createActionState({
      initialState: 0,
      action: (prev, delta) => prev + delta,
    });
    await state.dispatch(5);
    assert.equal(state.getValue(), 5);
    state.reset();
    assert.equal(state.getValue(), 0);
    assert.equal(state.getHistory().length, 1);
  });
  await ok('E6: 并发 dispatch 拒绝', async () => {
    let resolveFirst;
    const state = createActionState({
      initialState: 0,
      action: async (prev, delta) => {
        if (delta === 'slow') {
          await new Promise((r) => { resolveFirst = r; });
        }
        return prev + delta;
      },
    });
    const p1 = state.dispatch('slow');
    const p2 = state.dispatch(1);
    const r2 = await p2;
    assert.equal(r2.ok, false);
    assert.equal(r2.error, 'action_pending');
    resolveFirst();
    await p1;
  });

  // ============ Group F: createFormState ============
  await ok('F1: 基本创建', () => {
    const form = createFormState({
      initialFormData: { name: '', email: '' },
      onSubmit: async () => ({ ok: true }),
    });
    const state = form.getState();
    assert.equal(state.status, 'idle');
    assert.equal(state.isSubmitting, false);
    assert.equal(state.formData.name, '');
    assert.equal(form.getSubmissions(), 0);
  });
  await ok('F2: setField 设置字段', () => {
    const form = createFormState({
      initialFormData: { name: '', email: '' },
      onSubmit: async () => ({ ok: true }),
    });
    form.setField('name', 'Alice');
    assert.equal(form.getField('name'), 'Alice');
    form.setField('email', 'alice@example.com');
    assert.equal(form.getField('email'), 'alice@example.com');
  });
  await ok('F3: setFields 批量设置', () => {
    const form = createFormState({
      initialFormData: { name: '', email: '' },
      onSubmit: async () => ({ ok: true }),
    });
    form.setFields({ name: 'Bob', email: 'bob@example.com' });
    assert.equal(form.getField('name'), 'Bob');
    assert.equal(form.getField('email'), 'bob@example.com');
  });
  await ok('F4: submit 成功', async () => {
    let submittedData = null;
    const form = createFormState({
      initialFormData: { name: 'Alice' },
      onSubmit: async (data) => {
        submittedData = data;
        return { ok: true };
      },
    });
    const r = await form.submit();
    assert.equal(r.ok, true);
    assert.equal(r.status, 'success');
    assert.equal(form.getSubmissions(), 1);
    assert.ok(submittedData.name === 'Alice');
  });
  await ok('F5: submit 错误处理', async () => {
    const form = createFormState({
      initialFormData: { name: 'Alice' },
      onSubmit: async () => {
        throw new Error('submission_failed');
      },
    });
    const r = await form.submit();
    assert.equal(r.ok, false);
    assert.equal(r.error, 'submission_failed');
    const state = form.getState();
    assert.equal(state.status, 'error');
  });
  await ok('F6: reset 恢复初始状态', async () => {
    const form = createFormState({
      initialFormData: { name: '' },
      onSubmit: async () => ({ ok: true }),
    });
    form.setField('name', 'Alice');
    await form.submit();
    assert.equal(form.getSubmissions(), 1);
    form.reset();
    assert.equal(form.getField('name'), '');
    assert.equal(form.getSubmissions(), 0);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
