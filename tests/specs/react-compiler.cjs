// tests/specs/react-compiler.cjs
// Cycle 23 R4: React 19 Compiler 配置助手 深度测试
// 目标：≥ 50 PASS
//
// 背景：
//   - server/services/reactCompiler.js (153 lines) 此前完全未测（0 spec）
//   - 3 个导出：createCompilerConfig / analyzeComponent / generateMigrationReport
//   - createCompilerConfig 返回对象含 vitePlugin() / isCompatible() / getDependencies() / isValid()
//   - analyzeComponent 计算 needsMemo / canUseCompiler / recommendation / estimatedBenefit
//   - generateMigrationReport 聚合 summary + components + recommendations
//
// 覆盖点：
//   - 模块导出（3 个 API）
//   - createCompilerConfig 默认值 / 覆盖 / enabled=false / target / reactVersion / compilerOptions 传播
//   - vitePlugin 启用/禁用两种路径 + babel() 返回结构 + 参数合并
//   - isCompatible 版本边界（19.x / 18.3+ / 18.2 / 17.x）
//   - getDependencies 4 个依赖 + 版本号前缀
//   - isValid 三种状态（enabled+compat / disabled / incompat）
//   - analyzeComponent 6 种组合 + needsMemo / canUseCompiler 逻辑
//   - estimatedBenefit renderCount 边界（0 / 1 / >1）
//   - generateMigrationReport 空数组 + 多组件 + summary 聚合 + recommendations
//   - 集成：完整迁移报告流程

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const { createCompilerConfig, analyzeComponent, generateMigrationReport } = require(path.join(
  __dirname,
  '../../server/services/reactCompiler',
));

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

(async () => {
  console.log('=== react-compiler ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: 导出 3 个 API', () => {
    const keys = Object.keys(require(path.join(__dirname, '../../server/services/reactCompiler')));
    assert.deepStrictEqual(keys.sort(), ['analyzeComponent', 'createCompilerConfig', 'generateMigrationReport']);
  });
  await ok('A2: 3 个 API 都是函数', () => {
    assert.strictEqual(typeof createCompilerConfig, 'function');
    assert.strictEqual(typeof analyzeComponent, 'function');
    assert.strictEqual(typeof generateMigrationReport, 'function');
  });

  // ============ Group B: createCompilerConfig 默认值 ============
  await ok('B1: 无参返回对象', () => {
    const c = createCompilerConfig();
    assert.ok(c && typeof c === 'object');
  });
  await ok('B2: 默认 enabled=true', () => {
    assert.strictEqual(createCompilerConfig().enabled, true);
  });
  await ok('B3: 默认 target=react-compiler', () => {
    assert.strictEqual(createCompilerConfig().target, 'react-compiler');
  });
  await ok('B4: 默认 reactVersion=19.0.0', () => {
    assert.strictEqual(createCompilerConfig().reactVersion, '19.0.0');
  });
  await ok('B5: 默认 compilerOptions 为空对象', () => {
    assert.deepStrictEqual(createCompilerConfig().compilerOptions, { target: 'react-compiler' });
  });
  await ok('B6: 返回对象含 4 个方法', () => {
    const c = createCompilerConfig();
    assert.strictEqual(typeof c.vitePlugin, 'function');
    assert.strictEqual(typeof c.isCompatible, 'function');
    assert.strictEqual(typeof c.getDependencies, 'function');
    assert.strictEqual(typeof c.isValid, 'function');
  });
  await ok('B7: 返回对象含 4 个数据字段', () => {
    const c = createCompilerConfig();
    assert.ok('enabled' in c);
    assert.ok('target' in c);
    assert.ok('reactVersion' in c);
    assert.ok('compilerOptions' in c);
  });
  await ok('B8: compilerOptions.target 与 target 字段一致', () => {
    const c = createCompilerConfig({ target: 'custom-target' });
    assert.strictEqual(c.compilerOptions.target, 'custom-target');
    assert.strictEqual(c.target, 'custom-target');
  });

  // ============ Group C: createCompilerConfig 覆盖 ============
  await ok('C1: enabled=false', () => {
    assert.strictEqual(createCompilerConfig({ enabled: false }).enabled, false);
  });
  await ok('C2: 自定义 target', () => {
    assert.strictEqual(createCompilerConfig({ target: 'my-compiler' }).target, 'my-compiler');
  });
  await ok('C3: 自定义 reactVersion', () => {
    assert.strictEqual(createCompilerConfig({ reactVersion: '18.3.0' }).reactVersion, '18.3.0');
  });
  await ok('C4: 自定义 compilerOptions 传播', () => {
    const c = createCompilerConfig({ compilerOptions: { enableDebug: true, extra: 'x' } });
    assert.strictEqual(c.compilerOptions.enableDebug, true);
    assert.strictEqual(c.compilerOptions.extra, 'x');
    assert.strictEqual(c.compilerOptions.target, 'react-compiler');
  });
  await ok('C5: 空 opts 对象走默认', () => {
    const c = createCompilerConfig({});
    assert.strictEqual(c.enabled, true);
    assert.strictEqual(c.target, 'react-compiler');
    assert.strictEqual(c.reactVersion, '19.0.0');
  });
  await ok('C6: compilerOptions={} 与 undefined 等价', () => {
    const a = createCompilerConfig({ compilerOptions: {} });
    const b = createCompilerConfig();
    assert.deepStrictEqual(a.compilerOptions, b.compilerOptions);
  });
  await ok('C7: enabled=false 不影响其他字段', () => {
    const c = createCompilerConfig({ enabled: false, target: 'x', reactVersion: '18.3.0' });
    assert.strictEqual(c.enabled, false);
    assert.strictEqual(c.target, 'x');
    assert.strictEqual(c.reactVersion, '18.3.0');
  });

  // ============ Group D: vitePlugin() ============
  await ok('D1: enabled 时返回 @vitejs/plugin-react-compiler 插件', () => {
    const c = createCompilerConfig();
    const p = c.vitePlugin();
    assert.strictEqual(p.name, '@vitejs/plugin-react-compiler');
    assert.strictEqual(typeof p.babel, 'function');
  });
  await ok('D2: enabled=false 返回 disabled 插件', () => {
    const c = createCompilerConfig({ enabled: false });
    const p = c.vitePlugin();
    assert.strictEqual(p.name, 'react-compiler-disabled');
    assert.strictEqual(p.apply, 'build');
  });
  await ok('D3: disabled 插件无 babel() 方法', () => {
    const c = createCompilerConfig({ enabled: false });
    assert.strictEqual(typeof c.vitePlugin().babel, 'undefined');
  });
  await ok('D4: babel() 返回 plugins 数组', () => {
    const c = createCompilerConfig();
    const b = c.vitePlugin().babel();
    assert.ok(Array.isArray(b.plugins));
    assert.strictEqual(b.plugins.length, 1);
  });
  await ok('D5: babel() plugins[0] 是 [name, opts] 元组', () => {
    const c = createCompilerConfig();
    const p = c.vitePlugin().babel().plugins[0];
    assert.strictEqual(p[0], 'babel-plugin-react-compiler');
    assert.ok(p[1] && typeof p[1] === 'object');
  });
  await ok('D6: babel() 参数 target=react-compiler', () => {
    const c = createCompilerConfig();
    const opts = c.vitePlugin().babel().plugins[0][1];
    assert.strictEqual(opts.target, 'react-compiler');
  });
  await ok('D7: babel() 参数合并自定义 compilerOptions', () => {
    const c = createCompilerConfig({ compilerOptions: { enableDebug: true } });
    const opts = c.vitePlugin().babel().plugins[0][1];
    assert.strictEqual(opts.enableDebug, true);
    assert.strictEqual(opts.target, 'react-compiler');
  });
  await ok('D8: 自定义 target 不改变 babel 内部 target', () => {
    // babel() 内 target 硬编码为 'react-compiler'
    const c = createCompilerConfig({ target: 'custom-target' });
    const opts = c.vitePlugin().babel().plugins[0][1];
    assert.strictEqual(opts.target, 'react-compiler');
  });

  // ============ Group E: isCompatible() ============
  await ok('E1: 19.0.0 兼容', () => {
    assert.strictEqual(createCompilerConfig().isCompatible(), true);
  });
  await ok('E2: 18.3.0 兼容（边界）', () => {
    assert.strictEqual(createCompilerConfig({ reactVersion: '18.3.0' }).isCompatible(), true);
  });
  await ok('E3: 18.2.0 不兼容', () => {
    assert.strictEqual(createCompilerConfig({ reactVersion: '18.2.0' }).isCompatible(), false);
  });
  await ok('E4: 17.0.0 不兼容', () => {
    assert.strictEqual(createCompilerConfig({ reactVersion: '17.0.0' }).isCompatible(), false);
  });
  await ok('E5: 20.0.0 兼容', () => {
    assert.strictEqual(createCompilerConfig({ reactVersion: '20.0.0' }).isCompatible(), true);
  });
  await ok('E6: isCompatible 参数覆盖 reactVersion', () => {
    const c = createCompilerConfig({ reactVersion: '19.0.0' });
    assert.strictEqual(c.isCompatible('18.2.0'), false);
    assert.strictEqual(c.isCompatible('19.5.0'), true);
    assert.strictEqual(c.isCompatible('18.3.1'), true);
  });
  await ok('E7: 无参走 reactVersion 默认', () => {
    const c = createCompilerConfig({ reactVersion: '18.3.5' });
    assert.strictEqual(c.isCompatible(), true);
  });
  await ok('E8: 版本号解析失败不崩溃', () => {
    const c = createCompilerConfig({ reactVersion: '19.0.0' });
    // NaN >= 19 → false; NaN === 18 → false
    assert.strictEqual(c.isCompatible('bad-version'), false);
  });

  // ============ Group F: getDependencies() ============
  await ok('F1: 返回 4 个依赖', () => {
    const deps = createCompilerConfig().getDependencies();
    assert.strictEqual(Object.keys(deps).length, 4);
  });
  await ok('F2: react 版本 ^19.0.0', () => {
    const deps = createCompilerConfig().getDependencies();
    assert.strictEqual(deps.react, '^19.0.0');
  });
  await ok('F3: react-dom 版本 ^19.0.0', () => {
    const deps = createCompilerConfig().getDependencies();
    assert.strictEqual(deps['react-dom'], '^19.0.0');
  });
  await ok('F4: babel-plugin-react-compiler ^1.0.0', () => {
    const deps = createCompilerConfig().getDependencies();
    assert.strictEqual(deps['babel-plugin-react-compiler'], '^1.0.0');
  });
  await ok('F5: @vitejs/plugin-react ^4.2.1', () => {
    const deps = createCompilerConfig().getDependencies();
    assert.strictEqual(deps['@vitejs/plugin-react'], '^4.2.1');
  });
  await ok('F6: 自定义 reactVersion 反映到依赖', () => {
    const deps = createCompilerConfig({ reactVersion: '18.3.0' }).getDependencies();
    assert.strictEqual(deps.react, '^18.3.0');
    assert.strictEqual(deps['react-dom'], '^18.3.0');
  });
  await ok('F7: 依赖键名顺序稳定', () => {
    const keys = Object.keys(createCompilerConfig().getDependencies());
    assert.deepStrictEqual(keys, ['react', 'react-dom', 'babel-plugin-react-compiler', '@vitejs/plugin-react']);
  });

  // ============ Group G: isValid() ============
  await ok('G1: 默认 enabled + 19.0.0 有效', () => {
    const r = createCompilerConfig().isValid();
    assert.strictEqual(r.valid, true);
    assert.deepStrictEqual(r.errors, []);
  });
  await ok('G2: enabled=false 无效（含 1 个错误）', () => {
    const r = createCompilerConfig({ enabled: false }).isValid();
    assert.strictEqual(r.valid, false);
    assert.strictEqual(r.errors.length, 1);
    assert.match(r.errors[0], /compiler disabled/);
  });
  await ok('G3: 18.2.0 无效（版本不兼容）', () => {
    const r = createCompilerConfig({ reactVersion: '18.2.0' }).isValid();
    assert.strictEqual(r.valid, false);
    assert.strictEqual(r.errors.length, 1);
    assert.match(r.errors[0], /not compatible/);
  });
  await ok('G4: enabled=false + 18.2.0 无效（2 个错误）', () => {
    const r = createCompilerConfig({ enabled: false, reactVersion: '18.2.0' }).isValid();
    assert.strictEqual(r.valid, false);
    assert.strictEqual(r.errors.length, 2);
  });
  await ok('G5: 18.3.0 兼容有效', () => {
    const r = createCompilerConfig({ reactVersion: '18.3.0' }).isValid();
    assert.strictEqual(r.valid, true);
  });
  await ok('G6: isValid 返回 {valid, errors} 结构', () => {
    const r = createCompilerConfig().isValid();
    assert.strictEqual(typeof r.valid, 'boolean');
    assert.ok(Array.isArray(r.errors));
  });

  // ============ Group H: analyzeComponent ============
  await ok('H1: 无参返回默认结果', () => {
    const r = analyzeComponent('MyComponent');
    assert.strictEqual(r.componentName, 'MyComponent');
    assert.strictEqual(r.needsMemo, false);
    assert.strictEqual(r.canUseCompiler, true);
    assert.strictEqual(r.recommendation, 'no action needed');
  });
  await ok('H2: hasProps=true + isPure=false → needsMemo', () => {
    const r = analyzeComponent('C', { hasProps: true, isPure: false });
    assert.strictEqual(r.needsMemo, true);
    assert.match(r.recommendation, /React Compiler/);
  });
  await ok('H3: hasProps=true + isPure=true → 不需要 memo', () => {
    const r = analyzeComponent('C', { hasProps: true, isPure: true });
    assert.strictEqual(r.needsMemo, false);
  });
  await ok('H4: hasProps=false → 不需要 memo', () => {
    const r = analyzeComponent('C', { hasProps: false, isPure: false });
    assert.strictEqual(r.needsMemo, false);
  });
  await ok('H5: hasEffects=true + hasState=true → canUseCompiler', () => {
    const r = analyzeComponent('C', { hasEffects: true, hasState: true });
    assert.strictEqual(r.canUseCompiler, true);
  });
  await ok('H6: hasEffects=true + hasState=false → 不能用 compiler', () => {
    const r = analyzeComponent('C', { hasEffects: true, hasState: false });
    assert.strictEqual(r.canUseCompiler, false);
  });
  await ok('H7: hasEffects=false → canUseCompiler', () => {
    const r = analyzeComponent('C', { hasEffects: false, hasState: false });
    assert.strictEqual(r.canUseCompiler, true);
  });
  await ok('H8: estimatedBenefit renderCount=1 → 0% reduction', () => {
    const r = analyzeComponent('C', { hasProps: true, isPure: false, renderCount: 1 });
    assert.strictEqual(r.estimatedBenefit.renderReduction, '0%');
    assert.strictEqual(r.estimatedBenefit.rebaseCost, 'none');
  });
  await ok('H9: estimatedBenefit renderCount=5 → 80% reduction', () => {
    const r = analyzeComponent('C', { hasProps: true, isPure: false, renderCount: 5 });
    assert.strictEqual(r.estimatedBenefit.renderReduction, '80%');
    assert.strictEqual(r.estimatedBenefit.rebaseCost, 'low');
  });
  await ok('H10: estimatedBenefit renderCount=2 → 50% reduction', () => {
    const r = analyzeComponent('C', { hasProps: true, isPure: false, renderCount: 2 });
    assert.strictEqual(r.estimatedBenefit.renderReduction, '50%');
  });
  await ok('H11: 不需要 memo 时 estimatedBenefit 为 0%', () => {
    const r = analyzeComponent('C', { hasProps: false, renderCount: 5 });
    assert.strictEqual(r.estimatedBenefit.renderReduction, '0%');
    assert.strictEqual(r.estimatedBenefit.rebaseCost, 'none');
  });
  await ok('H12: 返回完整结构 5 字段', () => {
    const r = analyzeComponent('C');
    assert.deepStrictEqual(Object.keys(r).sort(), [
      'canUseCompiler',
      'componentName',
      'estimatedBenefit',
      'needsMemo',
      'recommendation',
    ]);
  });

  // ============ Group I: generateMigrationReport ============
  await ok('I1: 空数组返回空 summary', () => {
    const r = generateMigrationReport([]);
    assert.strictEqual(r.summary.totalComponents, 0);
    assert.strictEqual(r.summary.needsMigration, 0);
    assert.strictEqual(r.summary.canUseCompiler, 0);
  });
  await ok('I2: 无参返回空结果', () => {
    const r = generateMigrationReport();
    assert.strictEqual(r.summary.totalComponents, 0);
    assert.deepStrictEqual(r.components, []);
  });
  await ok('I3: 单组件迁移', () => {
    const r = generateMigrationReport([{ name: 'A', hasProps: true, isPure: false }]);
    assert.strictEqual(r.summary.totalComponents, 1);
    assert.strictEqual(r.summary.needsMigration, 1);
    assert.strictEqual(r.components.length, 1);
    assert.strictEqual(r.components[0].componentName, 'A');
  });
  await ok('I4: 多组件混合', () => {
    const r = generateMigrationReport([
      { name: 'A', hasProps: true, isPure: false },
      { name: 'B', hasProps: true, isPure: true },
      { name: 'C', hasProps: false, isPure: true },
    ]);
    assert.strictEqual(r.summary.totalComponents, 3);
    assert.strictEqual(r.summary.needsMigration, 1);
    assert.strictEqual(r.summary.canUseCompiler, 3);
  });
  await ok('I5: recommendations 总是 4 条', () => {
    const r = generateMigrationReport([]);
    assert.strictEqual(r.recommendations.length, 4);
    assert.match(r.recommendations[0], /Upgrade React/);
    assert.match(r.recommendations[1], /babel-plugin-react-compiler/);
    assert.ok(r.recommendations[2].includes('@vitejs/plugin-react'), 'recommendation mentions @vitejs/plugin-react');
    assert.match(r.recommendations[3], /Test all components/);
  });
  await ok('I6: 返回 summary + components + recommendations', () => {
    const r = generateMigrationReport([]);
    assert.deepStrictEqual(Object.keys(r).sort(), ['components', 'recommendations', 'summary']);
  });
  await ok('I7: components 数组按输入顺序', () => {
    const r = generateMigrationReport([
      { name: 'Z', hasProps: true, isPure: false },
      { name: 'A', hasProps: false },
    ]);
    assert.strictEqual(r.components[0].componentName, 'Z');
    assert.strictEqual(r.components[1].componentName, 'A');
  });

  // ============ Group J: 集成测试 ============
  await ok('J1: 完整迁移报告流程', () => {
    const c = createCompilerConfig({ reactVersion: '19.0.0' });
    assert.strictEqual(c.isValid().valid, true);
    assert.strictEqual(c.isCompatible(), true);
    const deps = c.getDependencies();
    assert.strictEqual(deps.react, '^19.0.0');
    const report = generateMigrationReport([
      { name: 'UserList', hasProps: true, isPure: false, renderCount: 3 },
      { name: 'Static', hasProps: false },
    ]);
    assert.strictEqual(report.summary.needsMigration, 1);
    assert.ok(report.components[0].estimatedBenefit.renderReduction.includes('%') && report.components[0].estimatedBenefit.renderReduction.startsWith('66'), `renderReduction ~66% (got ${report.components[0].estimatedBenefit.renderReduction})`);
  });
  await ok('J2: disabled 场景全链路', () => {
    const c = createCompilerConfig({ enabled: false });
    const p = c.vitePlugin();
    assert.strictEqual(p.name, 'react-compiler-disabled');
    assert.strictEqual(c.isValid().valid, false);
  });
  await ok('J3: 18.3 兼容场景', () => {
    const c = createCompilerConfig({ reactVersion: '18.3.0' });
    assert.strictEqual(c.isValid().valid, true);
    assert.strictEqual(c.isCompatible(), true);
    assert.strictEqual(c.getDependencies().react, '^18.3.0');
  });
  await ok('J4: 17.0 不兼容场景', () => {
    const c = createCompilerConfig({ reactVersion: '17.0.0' });
    const r = c.isValid();
    assert.strictEqual(r.valid, false);
    assert.match(r.errors[0], /not compatible/);
  });
  await ok('J5: analyzeComponent + report 联动', () => {
    const direct = analyzeComponent('X', { hasProps: true, isPure: false, renderCount: 4 });
    const viaReport = generateMigrationReport([{ name: 'X', hasProps: true, isPure: false, renderCount: 4 }]).components[0];
    assert.deepStrictEqual(direct, viaReport);
  });
  await ok('J6: 空组件列表 + 完整报告结构', () => {
    const r = generateMigrationReport([]);
    assert.strictEqual(r.summary.totalComponents, 0);
    assert.deepStrictEqual(r.components, []);
    assert.strictEqual(r.recommendations.length, 4);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
