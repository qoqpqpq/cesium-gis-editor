// tests/specs/metadata-ip-sync-script.cjs
// 周期 6 P0-1 续：metadata IP 自动同步脚本（对齐当前 sync-metadata-ips.cjs API）
//
// 背景：
//   - 周期 5 P0-1 建立维护文档 + 季度 cron 验证。
//   - 周期 12 P2-3 将脚本重构为「parse / dry-run / sync」工具：
//     scripts/sync-metadata-ips.cjs（导出 sync/parse/parseArgs/parseMarkdown/parseJson/parseCsv/DEFAULT_SOURCE）。
//   - 本 spec 验证当前脚本真实契约，替代早期断言过时 API（parseMarkdownTable/parseSourceSet）的旧版。
//
// 验收：
//   1. 脚本存在 + shebang
//   2. 模块导出全部公开 API
//   3. parseMarkdown 解析 docs/security/metadata-ips.md 含全部黑名单 IP
//   4. parseArgs 默认 dry-run；--write / --source / --format 正确
//   5. sync 默认 dry-run（不写文件），ok + 条目数 ≥ 黑名单规模
//   6. sync dry-run 不修改源文档
//   7. parseJson / parseCsv 正确解析
//   8. CLI 运行 exit 0 + JSON 报告
//   9. package.json 提供 "sync:metadata-ips" npm script 入口
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
const MOD = require(SCRIPT);

// 权威黑名单（与 metadata-ip-maintenance.cjs 一致）
const EXPECTED_IPS = [
  '169.254.169.254', '169.254.170.2', '169.254.170.1', '169.254.0.1',
  'fd00:ec2::254', 'fd00:ec2::253', 'fe80::a9f:feff:fecf:3c',
];

(async () => {
  console.log('=== metadata-ip-sync-script ===');

  // ---- 1. 脚本存在 + shebang ----
  await test('scripts/sync-metadata-ips.cjs 存在 + shebang', () => {
    assert.ok(fs.existsSync(SCRIPT), `脚本不存在: ${SCRIPT}`);
    const src = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(src, /^#!\/usr\/bin\/env\s+node/);
  });

  // ---- 2. 模块导出全部公开 API ----
  await test('模块导出 sync / parse / parseArgs / parseMarkdown / parseJson / parseCsv / DEFAULT_SOURCE', () => {
    for (const k of ['sync', 'parse', 'parseArgs', 'parseMarkdown', 'parseJson', 'parseCsv', 'DEFAULT_SOURCE']) {
      assert.ok(MOD[k], `应导出 ${k}`);
    }
    assert.strictEqual(typeof MOD.sync, 'function');
    assert.strictEqual(typeof MOD.parseMarkdown, 'function');
  });

  // ---- 3. parseMarkdown 解析维护文档含全部黑名单 IP ----
  await test('parseMarkdown(docs/security/metadata-ips.md) 含全部黑名单 IP', () => {
    const md = fs.readFileSync(MOD.DEFAULT_SOURCE, 'utf8');
    const entries = MOD.parseMarkdown(md);
    const cidrs = new Set(entries.map((e) => e.cidr));
    for (const ip of EXPECTED_IPS) {
      const cidr = ip.includes(':') ? `${ip}/128` : `${ip}/32`;
      assert.ok(cidrs.has(cidr), `解析结果应含 ${cidr}；实际 ${[...cidrs].join(', ')}`);
    }
  });

  // ---- 4. parseArgs 默认 dry-run；--write / --source / --format ----
  await test('parseArgs 默认 dryRun=true / format=markdown / source=DEFAULT_SOURCE', () => {
    const o = MOD.parseArgs(['node', 'x']);
    assert.strictEqual(o.dryRun, true);
    assert.strictEqual(o.format, 'markdown');
    assert.strictEqual(o.source, MOD.DEFAULT_SOURCE);
  });
  await test('parseArgs --write → dryRun=false；--source / --format 正确', () => {
    const o = MOD.parseArgs(['node', 'x', '--write', '--source=/tmp/a.md', '--format=json']);
    assert.strictEqual(o.dryRun, false);
    assert.strictEqual(o.source, '/tmp/a.md');
    assert.strictEqual(o.format, 'json');
  });

  // ---- 5. sync 默认 dry-run：ok + 条目数 ≥ 黑名单规模 + 不写 ----
  await test('sync() 默认 dry-run：ok=true / dryRun=true / count≥7 / written=false', () => {
    const r = MOD.sync(['node', 'x']);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.dryRun, true);
    assert.strictEqual(r.sourceExists, true);
    assert.ok(r.count >= 7, `条目数应 ≥7，实际 ${r.count}`);
    assert.strictEqual(r.written, false);
  });

  // ---- 6. sync dry-run 不修改源文档 ----
  await test('sync() dry-run 不修改源文档内容', () => {
    const before = fs.readFileSync(MOD.DEFAULT_SOURCE, 'utf8');
    MOD.sync(['node', 'x']);
    const after = fs.readFileSync(MOD.DEFAULT_SOURCE, 'utf8');
    assert.strictEqual(after, before, 'dry-run 不应改动 metadata-ips.md');
  });

  // ---- 7. parseJson / parseCsv ----
  await test('parseJson 解析数组 → cidr 补全', () => {
    const r = MOD.parseJson('[{"ip":"1.2.3.4","provider":"a"},{"ip":"fd00::1","cidr":"fd00::1/128"}]');
    assert.deepStrictEqual(r[0], { ip: '1.2.3.4', cidr: '1.2.3.4/32', provider: 'a', since: null });
    assert.strictEqual(r[1].cidr, 'fd00::1/128');
  });
  await test('parseCsv 解析 ip,cidr,provider 行', () => {
    const r = MOD.parseCsv('ip,cidr,provider\n1.2.3.4,1.2.3.4/32,a\n');
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].ip, '1.2.3.4');
    assert.strictEqual(r[0].cidr, '1.2.3.4/32');
    assert.strictEqual(r[0].provider, 'a');
  });

  // ---- 8. CLI 运行 exit 0 + JSON 报告 ----
  let cliOut = '';
  await test('CLI 运行 → exit 0 + JSON 报告含 count', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT });
    assert.strictEqual(r.status, 0, `exit 应为 0：\n${r.stderr || ''}`);
    cliOut = r.stdout || '';
    const j = JSON.parse(cliOut);
    assert.strictEqual(j.ok, true);
    assert.ok(typeof j.count === 'number');
    assert.strictEqual(j.dryRun, true);
  });

  // ---- 9. package.json 提供 npm script 入口 ----
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
