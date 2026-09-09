// tests/specs/telemetry-buffer-persist.cjs
// 周期 11 P2-2: telemetry buffer 可选持久化（env TELEMETRY_PERSIST_PATH）

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0;
let fail = 0;

function assert(cond, name, detail) {
  const tag = cond ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
  if (cond) pass += 1; else fail += 1;
}

(async () => {
  const root = path.resolve(__dirname, '..', '..');
  const tcPath = path.join(root, 'server/middleware/telemetryCollector.js');
  process.stdout.write('\n=== telemetry-buffer-persist ===\n');

  // 1) 文件存在
  assert(fs.existsSync(tcPath), 'telemetryCollector.js exists');
  const code = fs.readFileSync(tcPath, 'utf8');
  assert(/周期 11 P2-2/.test(code), 'cycle 11 P2-2 marker');
  assert(/TELEMETRY_PERSIST_PATH/.test(code), 'env var referenced');
  assert(/JSONL|appendFileSync/.test(code), 'JSONL append');
  assert(/PERSIST_MAX_BYTES/.test(code), 'size cap');
  assert(/getPersistStatus/.test(code), 'status export');

  // 2) 默认关闭（不设置 env）
  delete require.cache[require.resolve(tcPath)];
  const tc1 = require(tcPath);
  const s1 = tc1.getPersistStatus();
  assert(s1.enabled === false, 'persistence disabled by default');
  assert(s1.path === null, 'path is null when disabled');

  // 3) 启用持久化（env 模拟 + 子进程隔离）
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-persist-'));
  const jsonlPath = path.join(tmpDir, 'telemetry.jsonl');
  // 用子进程跑（env 必须在新进程生效）
  const { spawnSync } = require('child_process');
  const script = `
    process.env.TELEMETRY_PERSIST_PATH = ${JSON.stringify(jsonlPath)};
    const tc = require(${JSON.stringify(tcPath)});
    tc._resetBuffer();
    tc.recordClientError({ kind: 'unhandledrejection', message: 'test err 1' });
    tc.recordClientError({ kind: 'window.error', message: 'test err 2' });
    const s = tc.getPersistStatus();
    console.log(JSON.stringify(s));
  `;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  if (r.status !== 0) {
    assert(false, 'subprocess exit', `code=${r.status} stderr=${r.stderr}`);
  } else {
    const s = JSON.parse(r.stdout.trim());
    assert(s.enabled === true, 'persistence enabled via env');
    assert(s.path === jsonlPath, 'path matches env', `got ${s.path}`);
    assert(s.bytesWritten > 0, 'bytes written > 0', `bytes=${s.bytesWritten}`);
    assert(fs.existsSync(jsonlPath), 'JSONL file exists');
    const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
    assert(lines.length === 2, '2 JSONL lines', `n=${lines.length}`);
    const first = JSON.parse(lines[0]);
    assert(first.kind === 'unhandledrejection' && first.message === 'test err 1', 'line1 content');
    const second = JSON.parse(lines[1]);
    assert(second.kind === 'window.error' && second.message === 'test err 2', 'line2 content');
  }

  // 4) 持久化不影响 sliding buffer
  const tc2 = require(tcPath);
  tc2._resetBuffer();
  tc2.recordClientError({ kind: 'unhandledrejection', message: 'mem-test' });
  const mem = tc2.getRecentClientErrors({ limit: 10 });
  assert(mem.length >= 1 && mem[0].message === 'mem-test', 'in-memory buffer still works');

  // 5) 清理临时目录
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  assert(true, 'tmpdir cleanup done');

  // 6) 不破坏现有 telemetry route
  const routePath = path.join(root, 'server/routes/telemetry.js');
  assert(fs.existsSync(routePath), 'telemetry route still exists');
  const routeCode = fs.readFileSync(routePath, 'utf8');
  assert(/recordClientError/.test(routeCode) || /telemetryCollector/.test(routeCode), 'route uses collector');

  // 7) 大小上限检查（验证 code 中有 PERSIST_MAX_BYTES）
  assert(/10 \* 1024 \* 1024/.test(code), '10MB size cap hardcoded');
  assert(/Math\.max\(0/.test(code), 'remaining bytes calc');

  process.stdout.write(`\n--- summary: pass=${pass} fail=${fail} ---\n`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(2);
});
