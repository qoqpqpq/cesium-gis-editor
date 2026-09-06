// tests/specs/csp-connect-localhost.cjs
// 周期 2 P1-6: 验证生产态 helmet CSP 的 connectSrc 包含本地回环地址
//
// 背景：周期 1 调研 Top5 #2 指出：
//   - Vite 5.0.0–5.4.11 受 CVE-2025-24010 dev server CORS/Host 漏洞影响
//   - 当前 package.json 仍声明 ^5.0.12，开发者 npm install 会拉回旧版
//   - server/index.js 生产态 CSP 未列 localhost/127.0.0.1，前端若在生产态
//     调试本地 AI baseUrl 或本地 vite preview 会被 CSP 拒
//
// 修复（同一 commit P0-4 + P1-6）：
//   - client/package.json: vite 升到 ^5.4.12（≥ 5.4.12 修复 CVE）
//   - server/index.js CSP connectSrc 加 http://localhost:{3001,8080} + ws://localhost:8080
//
// 验收：
//   - 静态扫描 server/index.js 源文件，断言 connectSrc 数组含 localhost:3001/8080 + ws://localhost:8080
//   - 静态扫描 client/package.json，断言 vite 依赖 >= 5.4.12

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SERVER_INDEX = path.join(ROOT, 'server', 'index.js');
const CLIENT_PKG = path.join(ROOT, 'client', 'package.json');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    pass++;
  } catch (e) {
    console.error(`  [FAIL] ${name}:`, e.message);
    fail++;
  }
}

console.log('=== csp-connect-localhost ===');

// ---- 1. server/index.js 静态扫描 ----
const serverSrc = fs.readFileSync(SERVER_INDEX, 'utf8');

test('CSP connectSrc 包含 http://localhost:3001', () => {
  assert.match(serverSrc, /connectSrc:\s*\[[\s\S]*?http:\/\/localhost:3001/);
});
test('CSP connectSrc 包含 http://127.0.0.1:3001', () => {
  assert.match(serverSrc, /connectSrc:\s*\[[\s\S]*?http:\/\/127\.0\.0\.1:3001/);
});
test('CSP connectSrc 包含 http://localhost:8080（vite dev）', () => {
  assert.match(serverSrc, /connectSrc:\s*\[[\s\S]*?http:\/\/localhost:8080/);
});
test('CSP connectSrc 包含 ws://localhost:8080（HMR）', () => {
  assert.match(serverSrc, /connectSrc:\s*\[[\s\S]*?ws:\/\/localhost:8080/);
});
test('CSP 仍保留上游 AI 域名（不丢失）', () => {
  assert.match(serverSrc, /https:\/\/\*\.anthropic\.com/);
  assert.match(serverSrc, /https:\/\/\*\.openai\.com/);
  assert.match(serverSrc, /https:\/\/\*\.tianditu\.gov\.cn/);
});

// ---- 2. client/package.json 静态扫描 ----
const pkg = JSON.parse(fs.readFileSync(CLIENT_PKG, 'utf8'));
const viteRange = pkg.devDependencies?.vite;
test('client/package.json devDependencies.vite 已升到 ^5.4.12+', () => {
  assert.ok(viteRange, 'devDependencies.vite 缺失');
  // 简单：^5.4.12 / ^5.4.20 / ^5.4.21 都接受；拒绝 ^5.0.x / ^5.1.x / ^5.2.x / ^5.3.x
  const m = /^[\^~]?(\d+)\.(\d+)\.(\d+)/.exec(viteRange);
  assert.ok(m, `无法解析 vite 范围：${viteRange}`);
  const [, major, minor, patch] = m;
  const num = Number(major) * 10000 + Number(minor) * 100 + Number(patch);
  // CVE-2025-24010 修复版本 ≥ 5.4.12
  assert.ok(num >= 5 * 10000 + 4 * 100 + 12, `vite 范围 ${viteRange} 低于 5.4.12（CVE 修复版本）`);
});

// ---- 3. node_modules/vite 实际版本（如已安装） ----
test('已安装的 vite 版本 ≥ 5.4.12（实际加载验证）', () => {
  const vitePkgPath = path.join(ROOT, 'client', 'node_modules', 'vite', 'package.json');
  if (!fs.existsSync(vitePkgPath)) {
    console.log('  [SKIP] node_modules/vite 不存在（环境无 dev deps）');
    return;
  }
  const v = JSON.parse(fs.readFileSync(vitePkgPath, 'utf8'));
  const [major, minor, patch] = v.version.split('.').map(Number);
  const num = major * 10000 + minor * 100 + patch;
  assert.ok(num >= 5 * 10000 + 4 * 100 + 12, `实际安装 vite ${v.version} 低于 5.4.12`);
  console.log(`     当前安装版本: ${v.version}`);
});

console.log(`--- summary: pass=${pass} fail=${fail} ---`);
if (fail > 0) process.exit(1);
