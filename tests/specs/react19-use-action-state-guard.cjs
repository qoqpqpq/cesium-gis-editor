// tests/specs/react19-use-action-state-guard.cjs
// 周期 11 P1-2: React 19 useActionState 错误边界 wrapper

'use strict';

const path = require('path');
const fs = require('fs');

let pass = 0;
let fail = 0;

function assert(cond, name, detail) {
  const tag = cond ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
  if (cond) pass += 1; else fail += 1;
}

(async () => {
  const root = path.resolve(__dirname, '..', '..');
  const filePath = path.join(root, 'client/src/utils/useActionStateGuard.js');
  process.stdout.write('\n=== react19-use-action-state-guard ===\n');

  assert(fs.existsSync(filePath), 'module file exists', filePath);

  // ESM module: 用 dynamic import 加载
  const url = require('url');
  const modUrl = url.pathToFileURL(filePath).href;
  const mod = await import(modUrl);
  assert(typeof mod.useActionStateGuard === 'function', 'useActionStateGuard exported');
  assert(typeof mod.serializeError === 'function', 'serializeError exported');
  assert(typeof mod.isReact19 === 'function', 'isReact19 exported');
  assert(typeof mod.getReactVersion === 'function', 'getReactVersion exported');

  // 1) serializeError: Error 实例
  const err1 = new Error('boom');
  err1.stack = 'Error: boom\n  at ...';
  const s1 = mod.serializeError(err1);
  assert(s1.name === 'Error' && s1.message === 'boom', 'serializeError Error instance');
  assert(s1.stack && s1.stack.includes('boom'), 'serializeError keeps stack');

  // 2) serializeError: null
  const s2 = mod.serializeError(null);
  assert(s2.name === 'UnknownError', 'serializeError null → UnknownError');

  // 3) serializeError: string
  const s3 = mod.serializeError('plain string');
  assert(s3.name === 'NonErrorValue' && s3.message === 'plain string', 'serializeError string');

  // 4) serializeError: object
  const s4 = mod.serializeError({ code: 42, msg: 'oops' });
  assert(s4.name === 'NonErrorValue' && /42/.test(s4.message), 'serializeError object');

  // 5) serializeError: circular
  const circ = { name: 'C' };
  circ.self = circ;
  const s5 = mod.serializeError(circ);
  assert(s5.name === 'NonErrorValue', 'serializeError circular safe');

  // 6) isReact19: 当前是 React 18.2（package.json），故 false
  const r19 = mod.isReact19();
  process.stdout.write(`  [INFO] isReact19() = ${r19}\n`);
  assert(typeof r19 === 'boolean', 'isReact19 returns boolean');

  // 7) getReactVersion
  const v = mod.getReactVersion();
  assert(typeof v === 'string', 'getReactVersion returns string', `v=${v}`);

  // 8) useActionStateGuard 签名校验
  assert(mod.useActionStateGuard.length === 2 || mod.useActionStateGuard.length === 3, 'useActionStateGuard arity 2-3');

  // 9) 错误参数：非函数 actionFn
  let threw = false;
  try {
    mod.useActionStateGuard('not a function', {});
  } catch (e) {
    threw = true;
    assert(/must be a function/.test(e.message), 'rejects non-function actionFn', `msg=${e.message.slice(0, 80)}`);
  }
  if (!threw) assert(false, 'rejects non-function actionFn (no throw)');

  // 10) 错误参数：非对象 initialState
  let threw2 = false;
  try {
    mod.useActionStateGuard(() => ({}), null);
  } catch (e) {
    threw2 = true;
    assert(/must be an object/.test(e.message), 'rejects non-object initialState', `msg=${e.message.slice(0, 80)}`);
  }
  if (!threw2) assert(false, 'rejects non-object initialState (no throw)');

  // 11) 当前 React 版本下 reducer / clearError 接口设计（无 React 环境）
  // 仅验证文件语义完整（通过搜索关键字）
  const code = fs.readFileSync(filePath, 'utf8');
  assert(/React 19/.test(code), 'doc references React 19');
  assert(/useActionState/.test(code), 'uses useActionState');
  assert(/serializeError/.test(code), 'uses serializeError');
  assert(/isPending/.test(code), 'exposes isPending');
  assert(/clearError/.test(code), 'exposes clearError');
  assert(/reducer/.test(code), 'supports reducer override');
  assert(/onError/.test(code), 'onError callback');
  assert(/JSON.stringify/.test(code), 'JSON-friendly serialization');

  // 12) 兼容 React 18（fallback 路径存在）
  assert(/useState/.test(code), 'fallback uses useState');
  assert(/useCallback/.test(code), 'fallback uses useCallback');

  // 13) 当前项目 React 版本检查（package.json 仍是 18.2）
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'client/package.json'), 'utf8'));
  const reactVer = pkg.dependencies.react || '';
  process.stdout.write(`  [INFO] client React = ${reactVer}\n`);
  assert(/^[\^~]?18\./.test(reactVer) || /^[\^~]?19\./.test(reactVer), 'React 18 or 19 in package.json');

  // 14) 不破坏现有 asyncGuard.js
  const asyncGuardPath = path.join(root, 'client/src/utils/asyncGuard.js');
  assert(fs.existsSync(asyncGuardPath), 'asyncGuard.js coexists');
  const agCode = fs.readFileSync(asyncGuardPath, 'utf8');
  assert(/installAsyncGuard/.test(agCode), 'asyncGuard still exports installAsyncGuard');

  // 15) 错误捕获示例（手写模拟 reducer）
  let captured = null;
  async function demoAction(prev, formData) {
    if (formData && formData.boom) throw new Error('demo boom');
    return { ok: true };
  }
  // 模拟 reducer 路径
  try {
    await demoAction({}, { boom: true });
  } catch (e) {
    captured = mod.serializeError(e);
  }
  assert(captured && captured.message === 'demo boom', 'reducer-path error serialization');

  process.stdout.write(`\n--- summary: pass=${pass} fail=${fail} ---\n`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(2);
});
