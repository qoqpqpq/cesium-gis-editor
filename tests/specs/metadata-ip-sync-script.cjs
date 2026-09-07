// tests/specs/metadata-ip-sync-script.cjs
// 周期 6 P0-1 续：metadata IP 自动同步脚本
//
// 背景：周期 5 P0-1 已建立维护文档 + 季度 cron 验证 spec。
//   本 spec 验证 `scripts/sync-metadata-ips.cjs` 行为：
//   1. 脚本存在
//   2. 脚本运行后 exit code 0（pass ≥ fail）
//   3. 脚本输出含 "三方完全一致"
//   4. 脚本输出含 IPv4 / IPv6 一致性 PASS
//   5. 脚本输出含 isMetadataIp 运行时验证 PASS
//
// 运行：node tests/specs/metadata-ip-sync-script.cjs

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'sync-metadata-ips.cjs');

(async () => {
  console.log('=== metadata-ip-sync-script ===');

  // ---- 1. 脚本存在 ----
  await test('scripts/sync-metadata-ips.cjs 存在', () => {
    assert.ok(fs.existsSync(SCRIPT), `脚本不存在: ${SCRIPT}`);
  });

  // ---- 2. 脚本有 shebang + 包含关键字符串 ----
  const src = fs.readFileSync(SCRIPT, 'utf8');
  await test('脚本含 shebang', () => {
    assert.match(src, /^#!\/usr\/bin\/env\s+node/);
  });
  await test('脚本含核心函数：parseMarkdownTable / parseSourceSet', () => {
    assert.match(src, /function\s+parseMarkdownTable/);
    assert.match(src, /function\s+parseSourceSet/);
  });
  await test('脚本引用 isMetadataIp 运行时验证', () => {
    assert.match(src, /isMetadataIp/);
    assert.match(src, /ssrf-guard/);
  });
  await test('脚本含 "三方完全一致" 终态文案', () => {
    assert.match(src, /三方完全一致/);
  });
  await test('脚本 exit code 0 on 一致', () => {
    assert.match(src, /fail\s*>\s*0\s*\?\s*1\s*:\s*0/);
  });

  // ---- 3. 实际跑脚本 ----
  let stdout = '';
  let exitCode = 0;
  await test('脚本执行 → exit 0', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT });
    stdout = r.stdout || '';
    exitCode = r.status;
    assert.strictEqual(exitCode, 0, `脚本 exit code 应为 0，实际 ${exitCode}：\nSTDOUT:\n${stdout}\nSTDERR:\n${r.stderr}`);
  });

  await test('脚本输出含 "三方完全一致"', () => {
    assert.match(stdout, /三方完全一致/);
  });

  await test('脚本输出含 IPv4 / IPv6 一致性 PASS', () => {
    assert.match(stdout, /\[PASS\] IPv4 文档 \/ 源文件 一致/);
    assert.match(stdout, /\[PASS\] IPv6 文档 \/ 源文件 一致/);
  });

  await test('脚本输出含 isMetadataIp 运行时验证', () => {
    assert.match(stdout, /isMetadataIp\('169\.254\.169\.254'\)\s*=\s*true/);
    assert.match(stdout, /isMetadataIp\('fd00:ec2::253'\)\s*=\s*true/);
  });

  await test('脚本输出含 summary pass ≥ 10（季度 cron 期望）', () => {
    const m = stdout.match(/summary: pass=(\d+) fail=(\d+)/);
    assert.ok(m, `输出应含 summary: ${stdout.slice(-200)}`);
    const p = parseInt(m[1], 10);
    const f = parseInt(m[2], 10);
    assert.ok(p >= 10, `pass 应 ≥10，实际 ${p}`);
    assert.strictEqual(f, 0, `fail 应 0，实际 ${f}`);
  });

  // ---- 4. package.json 提供 npm script 入口（可选）----
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  await test('package.json 含 "sync:metadata-ips" npm script', () => {
    const scripts = pkg.scripts || {};
    assert.ok(scripts['sync:metadata-ips'], 'package.json 应含 "sync:metadata-ips" script 入口');
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
