// tests/specs/metadata-ip-sync.cjs
// 周期 12 P2-3: sync-metadata-ips 单元测试
// 目标：≥ 12 子断言 PASS

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { sync, parse, parseArgs, parseMarkdown, parseJson, parseCsv, DEFAULT_SOURCE } = require(path.join(__dirname, '../../scripts/sync-metadata-ips.cjs'));

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
  console.log('=== metadata-ip-sync ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: sync 已导出', () => {
    assert.equal(typeof sync, 'function');
  });
  await ok('A2: parse 已导出', () => {
    assert.equal(typeof parse, 'function');
  });
  await ok('A3: parseArgs 已导出', () => {
    assert.equal(typeof parseArgs, 'function');
  });
  await ok('A4: parseMarkdown / parseJson / parseCsv 已导出', () => {
    assert.equal(typeof parseMarkdown, 'function');
    assert.equal(typeof parseJson, 'function');
    assert.equal(typeof parseCsv, 'function');
  });
  await ok('A5: DEFAULT_SOURCE 字符串', () => {
    assert.match(DEFAULT_SOURCE, /metadata-ips\.md$/);
  });

  // ============ Group B: parseArgs ============
  await ok('B1: 默认 dryRun=true', () => {
    const o = parseArgs(['node', 'sync']);
    assert.equal(o.dryRun, true);
  });
  await ok('B2: --write 关闭 dry-run', () => {
    const o = parseArgs(['node', 'sync', '--write']);
    assert.equal(o.dryRun, false);
  });
  await ok('B3: --dry-run 显式开启', () => {
    const o = parseArgs(['node', 'sync', '--dry-run']);
    assert.equal(o.dryRun, true);
  });
  await ok('B4: --source= 覆盖', () => {
    const o = parseArgs(['node', 'sync', '--source=/tmp/foo.md']);
    assert.equal(o.source, '/tmp/foo.md');
  });
  await ok('B5: --format= 覆盖', () => {
    const o = parseArgs(['node', 'sync', '--format=json']);
    assert.equal(o.format, 'json');
  });

  // ============ Group C: parseMarkdown ============
  await ok('C1: 解析 IPv4 CIDR', () => {
    const r = parseMarkdown('- 169.254.169.254/32');
    assert.equal(r.length, 1);
    assert.equal(r[0].cidr, '169.254.169.254/32');
  });
  await ok('C2: 解析单 IP → /32', () => {
    const r = parseMarkdown('foo 169.254.169.254 bar');
    assert.equal(r.length, 1);
    assert.equal(r[0].cidr, '169.254.169.254/32');
  });
  await ok('C3: 解析 IPv6 CIDR', () => {
    const r = parseMarkdown('- fd00:ec2::254/128');
    assert.ok(r.some((x) => x.cidr === 'fd00:ec2::254/128'));
  });
  await ok('C4: 跳过注释行', () => {
    const r = parseMarkdown('# 169.254.169.254');
    assert.equal(r.length, 0);
  });
  await ok('C5: 去重', () => {
    const r = parseMarkdown('169.254.169.254\n169.254.169.254');
    assert.equal(r.length, 1);
  });

  // ============ Group D: parseJson / parseCsv ============
  await ok('D1: parseJson 数组', () => {
    const r = parseJson(JSON.stringify([{ ip: '169.254.169.254', provider: 'AWS' }]));
    assert.equal(r.length, 1);
    assert.equal(r[0].cidr, '169.254.169.254/32');
    assert.equal(r[0].provider, 'AWS');
  });
  await ok('D2: parseJson IPv6', () => {
    const r = parseJson(JSON.stringify([{ ip: 'fd00:ec2::254' }]));
    assert.equal(r[0].cidr, 'fd00:ec2::254/128');
  });
  await ok('D3: parseCsv 含表头', () => {
    const r = parseCsv('ip,cidr,provider\n169.254.169.254,,AWS');
    assert.equal(r.length, 1);
    assert.equal(r[0].cidr, '169.254.169.254/32');
    assert.equal(r[0].provider, 'AWS');
  });

  // ============ Group E: sync 主流程（dry-run） ============
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mip-sync-'));
  const testFile = path.join(tmpDir, 'metadata.md');

  await ok('E1: 缺源文件 → entries=[]', () => {
    const r = sync(['node', 'sync', '--source=' + path.join(tmpDir, 'no-such.md')]);
    assert.equal(r.entries.length, 0);
    assert.equal(r.sourceExists, false);
    assert.equal(r.ok, true);
  });

  await ok('E2: 写文件 dry-run 不动', () => {
    fs.writeFileSync(testFile, '- 169.254.169.254/32\n- 169.254.0.0/16\n');
    const r = sync(['node', 'sync', '--source=' + testFile]);
    assert.equal(r.ok, true);
    assert.equal(r.dryRun, true);
    assert.equal(r.count, 2);
    // 文件未改
    assert.ok(fs.readFileSync(testFile, 'utf8').startsWith('- 169.254.169.254'));
  });

  await ok('E3: --write 写入 banner + 列表', () => {
    fs.writeFileSync(testFile, '- 169.254.169.254/32\n');
    const r = sync(['node', 'sync', '--source=' + testFile, '--write']);
    assert.equal(r.written, true);
    const content = fs.readFileSync(testFile, 'utf8');
    assert.match(content, /synced at/);
    assert.match(content, /169\.254\.169\.254\/32/);
  });

  await ok('E4: parse 路由', () => {
    const mdRes = parse('# 169.254.169.254', 'markdown');
    assert.ok(Array.isArray(mdRes) || typeof mdRes === 'object');
    // json parse error 形式（SyntaxError 或自定义）
    try {
      parse('not json', 'json');
      assert.fail('应该抛错');
    } catch (_) { /* expected */ }
  });

  // ============ Group F: 与 ssrf-guard 兼容性 ============
  await ok('F1: IP 字符串格式兼容（IPv4+IPv6）', () => {
    const r = parseMarkdown(`
      - 169.254.169.254/32
      - fd00:ec2::254/128
      - 100.64.0.0/10
    `);
    const cidrs = r.map((x) => x.cidr);
    assert.ok(cidrs.includes('169.254.169.254/32'));
    assert.ok(cidrs.includes('fd00:ec2::254/128'));
    assert.ok(cidrs.includes('100.64.0.0/10'));
  });

  // ============ Teardown ============
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});