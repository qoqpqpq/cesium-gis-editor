#!/usr/bin/env node
// cycle-332 (OBS-3301): 批量回归 runner —— 分级超时 + 失败重试一次。
// 背景: cycle-330 全量跑 172 个 spec 时 css-duplication-audit 因瞬时抖动被 timeout 90 误杀上报为 FAIL
// (复跑 3/3 PASS、实测 0.54s、输入确定)。本 runner 用更宽的超时 + 自动重试一次，只有重试仍失败才报 FAIL。
// 用法: node tests/run-suite.cjs [--timeout=150] [--pattern=substr]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const tOpt = args.find((a) => a.startsWith('--timeout='));
const pOpt = args.find((a) => a.startsWith('--pattern='));
// --timeout= 以「秒」为单位（默认 150s）；内部转毫秒。曾踩坑：把秒误当毫秒导致子进程被瞬时 kill。
const TIMEOUT = tOpt ? parseInt(tOpt.split('=')[1], 10) * 1000 : 150_000;
const PATTERN = pOpt ? pOpt.split('=')[1] : '';

const dir = path.join(__dirname, 'specs');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cjs') && (!PATTERN || f.includes(PATTERN))).sort();

function runOne(f) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], {
    timeout: TIMEOUT, encoding: 'utf8', stdio: 'pipe',
  });
  return { code: r.status, signal: r.signal, timedOut: r.error && r.error.code === 'ETIMEDOUT' };
}

let pass = 0, fail = 0, failed = [];
files.forEach((f, i) => {
  const a = runOne(f);
  if (a.code === 0) { pass++; }
  else {
    const b = runOne(f); // 自动重试一次
    if (b.code === 0) { pass++; }
    else { fail++; failed.push(f); }
  }
  if ((i + 1) % 20 === 0 || i === files.length - 1) {
    process.stdout.write(`  ${i + 1}/${files.length} 运行中… 通过=${pass} 失败=${fail}\r`);
  }
});
process.stdout.write('\n');
console.log(`TOTAL=${files.length} PASS=${pass} FAIL=${fail}`);
if (fail) console.log(`FAILED:${failed.map((f) => ' ' + f).join('')}`);
process.exit(fail ? 1 : 0);
