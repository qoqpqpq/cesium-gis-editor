// tests/specs/ratelimit-skip-cidr.cjs
// 周期 1 P0-2: rateLimit.isLocal 只放行 loopback（127.0.0.1 / ::1），
// 不再因 10/192.168/172.16 段全部跳过限流。
//
// 验证方式：直接 require rateLimit 模块，对 isLocal 函数做表驱动。
//   - 127.0.0.1 / ::ffff:127.0.0.1 / ::1 → true
//   - 10.x / 192.168.x / 172.16.x       → false
//   - 公网 IP / 其它                    → false
//
// 这是一个无 IO 单元测试，秒级完成。

'use strict';

const path = require('path');

const { isLocal } = require(path.resolve(__dirname, '..', '..', 'server', 'middleware', 'rateLimit.js'));

const cases = [
  ['127.0.0.1', true],
  ['::1', true],
  ['::ffff:127.0.0.1', true],
  ['10.0.0.1', false],
  ['10.255.255.255', false],
  ['192.168.1.1', false],
  ['192.168.0.100', false],
  ['172.16.0.1', false],
  ['172.31.255.255', false],
  ['8.8.8.8', false],
  ['2001:db8::1', false],
  ['', false],
  [undefined, false],
];

let pass = 0;
let fail = 0;
for (const [ip, expected] of cases) {
  // isLocal(req) 用 req.ip 或 req.socket.remoteAddress
  const req = { ip, socket: { remoteAddress: ip } };
  const got = isLocal(req);
  const ok = got === expected;
  process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] isLocal(${JSON.stringify(ip)}) === ${expected} (got=${got})\n`);
  if (ok) pass += 1; else fail += 1;
}

process.stdout.write(`--- spec ratelimit-skip-cidr: pass=${pass} fail=${fail} ---\n`);
if (fail > 0) process.exit(1);
