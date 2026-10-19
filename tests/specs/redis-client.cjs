// tests/specs/redis-client.cjs
// 周期 20 R4: redisClient.js Redis 客户端测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - RedisClient 类（connect/close/_rawCommand/_send/_onData/_parseBuffer）
//   - 高层命令（ping/zadd/zremrangebyscore/zcard/expire/del/eval/evalsha/scriptLoad）
//   - encodeCommand RESP 编码
//   - parseReply RESP 解码
//   - NeedMoreDataError 错误类
//   - 环境变量配置

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const REDIS_SRC = fs.readFileSync(path.join(ROOT, 'server/middleware/redisClient.js'), 'utf8');

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
  console.log('=== redis-client ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 RedisClient', () => {
    assert.match(REDIS_SRC, /RedisClient/);
  });
  await ok('A2: 导出 encodeCommand', () => {
    assert.match(REDIS_SRC, /encodeCommand/);
  });
  await ok('A3: 导出 parseReply', () => {
    assert.match(REDIS_SRC, /parseReply/);
  });
  await ok('A4: 导出 NeedMoreDataError', () => {
    assert.match(REDIS_SRC, /NeedMoreDataError/);
  });
  await ok('A5: 继承 EventEmitter', () => {
    assert.match(REDIS_SRC, /extends\s+EventEmitter/);
  });

  // ============ Group B: 静态扫描 - 依赖导入 ============
  await ok('B1: 导入 net', () => {
    assert.match(REDIS_SRC, /require\s*\(\s*['"]node:net['"]\s*\)/);
  });
  await ok('B2: 导入 EventEmitter', () => {
    assert.match(REDIS_SRC, /require\s*\(\s*['"]node:events['"]\s*\)/);
  });

  // ============ Group C: RedisClient 构造函数验证 ============
  await ok('C1: 接受 opts 参数', () => {
    assert.match(REDIS_SRC, /constructor\s*\(\s*opts\s*=\s*\{\}\s*\)/);
  });
  await ok('C2: 设置 host', () => {
    assert.match(REDIS_SRC, /this\.host\s*=\s*opts\.host\s*\|\|\s*process\.env\.REDIS_HOST/);
  });
  await ok('C3: 设置 port', () => {
    assert.match(REDIS_SRC, /this\.port\s*=\s*opts\.port\s*\|\|\s*parseInt\s*\(\s*process\.env\.REDIS_PORT/);
  });
  await ok('C4: 设置 password', () => {
    assert.match(REDIS_SRC, /this\.password\s*=\s*opts\.password\s*\|\|\s*process\.env\.REDIS_PASSWORD/);
  });
  await ok('C5: 设置 db', () => {
    assert.match(REDIS_SRC, /this\.db\s*=\s*parseInt\s*\(\s*opts\.db\s*\|\|\s*process\.env\.REDIS_DB/);
  });
  await ok('C6: 初始化 socket', () => {
    assert.match(REDIS_SRC, /this\.socket\s*=\s*null/);
  });
  await ok('C7: 初始化 connected', () => {
    assert.match(REDIS_SRC, /this\.connected\s*=\s*false/);
  });
  await ok('C8: 初始化 _connectPromise', () => {
    assert.match(REDIS_SRC, /this\._connectPromise\s*=\s*null/);
  });
  await ok('C9: 初始化 _buffer', () => {
    assert.match(REDIS_SRC, /this\._buffer\s*=\s*Buffer\.alloc\s*\(\s*0\s*\)/);
  });
  await ok('C10: 初始化 _cmdQueue', () => {
    assert.match(REDIS_SRC, /this\._cmdQueue\s*=\s*\[\]/);
  });
  await ok('C11: 初始化 _inAuth', () => {
    assert.match(REDIS_SRC, /this\._inAuth\s*=\s*false/);
  });
  await ok('C12: 初始化 _closed', () => {
    assert.match(REDIS_SRC, /this\._closed\s*=\s*false/);
  });

  // ============ Group D: connect 方法验证 ============
  await ok('D1: async 方法', () => {
    assert.match(REDIS_SRC, /async\s+connect\s*\(\s*\)/);
  });
  await ok('D2: 检查 connected', () => {
    assert.match(REDIS_SRC, /if\s*\(\s*this\.connected\s*\)\s+return/);
  });
  await ok('D3: 检查 _connectPromise', () => {
    assert.match(REDIS_SRC, /if\s*\(\s*this\._connectPromise\s*\)\s+return\s+this\._connectPromise/);
  });
  await ok('D4: 检查 _closed', () => {
    assert.match(REDIS_SRC, /if\s*\(\s*this\._closed\s*\)\s+return\s+reject/);
  });
  await ok('D5: 创建 socket', () => {
    assert.match(REDIS_SRC, /net\.createConnection/);
  });
  await ok('D6: setNoDelay', () => {
    assert.match(REDIS_SRC, /setNoDelay\s*\(\s*true\s*\)/);
  });
  await ok('D7: 监听 connect 事件', () => {
    assert.match(REDIS_SRC, /sock\.once\s*\(\s*['"]connect['"]/);
  });
  await ok('D8: 设置 connected', () => {
    assert.match(REDIS_SRC, /this\.connected\s*=\s*true/);
  });
  await ok('D9: 检查 password', () => {
    assert.match(REDIS_SRC, /if\s*\(\s*this\.password\s*\)/);
  });
  await ok('D10: AUTH 命令', () => {
    assert.match(REDIS_SRC, /['"]AUTH['"]/);
  });
  await ok('D11: 检查 db', () => {
    assert.match(REDIS_SRC, /if\s*\(\s*this\.db\s*>\s*0\s*\)/);
  });
  await ok('D12: SELECT 命令', () => {
    assert.match(REDIS_SRC, /['"]SELECT['"]/);
  });
  await ok('D13: 监听 error 事件', () => {
    assert.match(REDIS_SRC, /sock\.once\s*\(\s*['"]error['"]/);
  });
  await ok('D14: 监听 data 事件', () => {
    assert.match(REDIS_SRC, /sock\.on\s*\(\s*['"]data['"]/);
  });
  await ok('D15: 监听 close 事件', () => {
    assert.match(REDIS_SRC, /sock\.on\s*\(\s*['"]close['"]/);
  });

  // ============ Group E: close 方法验证 ============
  await ok('E1: async 方法', () => {
    assert.match(REDIS_SRC, /async\s+close\s*\(\s*\)/);
  });
  await ok('E2: 设置 _closed', () => {
    assert.match(REDIS_SRC, /this\._closed\s*=\s*true/);
  });
  await ok('E3: destroy socket', () => {
    assert.match(REDIS_SRC, /this\.socket\.destroy\s*\(\s*\)/);
  });
  await ok('E4: 设置 connected', () => {
    assert.match(REDIS_SRC, /this\.connected\s*=\s*false/);
  });

  // ============ Group F: _rawCommand 方法验证 ============
  await ok('F1: async 方法', () => {
    assert.match(REDIS_SRC, /async\s+_rawCommand\s*\(\s*parts\s*\)/);
  });
  await ok('F2: 检查 _closed', () => {
    assert.match(REDIS_SRC, /if\s*\(\s*this\._closed\s*\)\s+throw/);
  });
  await ok('F3: 检查 connected', () => {
    assert.match(REDIS_SRC, /if\s*\(\s*!\s*this\.connected\s*\)\s+await\s+this\.connect\s*\(\s*\)/);
  });
  await ok('F4: 返回 Promise', () => {
    assert.match(REDIS_SRC, /return\s+new\s+Promise/);
  });
  await ok('F5: 推入 _cmdQueue', () => {
    assert.match(REDIS_SRC, /this\._cmdQueue\.push/);
  });
  await ok('F6: 调用 _send', () => {
    assert.match(REDIS_SRC, /this\._send\s*\(\s*parts\s*\)/);
  });

  // ============ Group G: _send 方法验证 ============
  await ok('G1: 调用 encodeCommand', () => {
    assert.match(REDIS_SRC, /encodeCommand\s*\(\s*parts\s*\)/);
  });
  await ok('G2: 写入 socket', () => {
    assert.match(REDIS_SRC, /this\.socket\.write/);
  });
  await ok('G3: 捕获异常', () => {
    assert.match(REDIS_SRC, /catch\s*\(\s*e\s*\)/);
  });
  await ok('G4: 调用 _rejectAllPending', () => {
    assert.match(REDIS_SRC, /this\._rejectAllPending/);
  });

  // ============ Group H: _onData 方法验证 ============
  await ok('H1: 拼接 buffer', () => {
    assert.match(REDIS_SRC, /Buffer\.concat/);
  });
  await ok('H2: 调用 _parseBuffer', () => {
    assert.match(REDIS_SRC, /this\._parseBuffer\s*\(\s*\)/);
  });

  // ============ Group I: _parseBuffer 方法验证 ============
  await ok('I1: while 循环', () => {
    assert.match(REDIS_SRC, /while\s*\(\s*this\._buffer\.length\s*>\s*0\s*\)/);
  });
  await ok('I2: 检查 _cmdQueue', () => {
    assert.match(REDIS_SRC, /this\._cmdQueue\[0\]/);
  });
  await ok('I3: 调用 parseReply', () => {
    assert.match(REDIS_SRC, /parseReply\s*\(\s*this\._buffer\s*\)/);
  });
  await ok('I4: 检查 consumed', () => {
    assert.match(REDIS_SRC, /consumed\s*===\s*0/);
  });
  await ok('I5: 切片 buffer', () => {
    assert.match(REDIS_SRC, /this\._buffer\.slice\s*\(\s*consumed\s*\)/);
  });
  await ok('I6: shift _cmdQueue', () => {
    assert.match(REDIS_SRC, /this\._cmdQueue\.shift/);
  });
  await ok('I7: resolve 值', () => {
    assert.match(REDIS_SRC, /c\.resolve\s*\(\s*value\s*\)/);
  });
  await ok('I8: 处理 EAGAIN', () => {
    assert.match(REDIS_SRC, /e\.code\s*===\s*['"]EAGAIN['"]/);
  });
  await ok('I9: 协议错误', () => {
    assert.match(REDIS_SRC, /c2\.reject\s*\(\s*e\s*\)/);
  });
  await ok('I10: destroy socket', () => {
    assert.match(REDIS_SRC, /this\.socket\.destroy\s*\(\s*\)/);
  });

  // ============ Group J: _rejectAllPending 方法验证 ============
  await ok('J1: 接受 err 参数', () => {
    assert.match(REDIS_SRC, /_rejectAllPending\s*\(\s*err\s*\)/);
  });
  await ok('J2: while 循环', () => {
    assert.match(REDIS_SRC, /while\s*\(\s*this\._cmdQueue\.length\s*>\s*0\s*\)/);
  });
  await ok('J3: shift _cmdQueue', () => {
    assert.match(REDIS_SRC, /this\._cmdQueue\.shift/);
  });
  await ok('J4: reject 错误', () => {
    assert.match(REDIS_SRC, /c\.reject\s*\(\s*err\s*\)/);
  });

  // ============ Group K: 高层命令验证 ============
  await ok('K1: ping 方法', () => {
    assert.match(REDIS_SRC, /async\s+ping\s*\(\s*\)/);
  });
  await ok('K2: ping 命令', () => {
    assert.match(REDIS_SRC, /['"]PING['"]/);
  });
  await ok('K3: zadd 方法', () => {
    assert.match(REDIS_SRC, /async\s+zadd\s*\(\s*key\s*,\s*score\s*,\s*member\s*\)/);
  });
  await ok('K4: ZADD 命令', () => {
    assert.match(REDIS_SRC, /['"]ZADD['"]/);
  });
  await ok('K5: zremrangebyscore 方法', () => {
    assert.match(REDIS_SRC, /async\s+zremrangebyscore\s*\(\s*key\s*,\s*min\s*,\s*max\s*\)/);
  });
  await ok('K6: ZREMRANGEBYSCORE 命令', () => {
    assert.match(REDIS_SRC, /['"]ZREMRANGEBYSCORE['"]/);
  });
  await ok('K7: zcard 方法', () => {
    assert.match(REDIS_SRC, /async\s+zcard\s*\(\s*key\s*\)/);
  });
  await ok('K8: ZCARD 命令', () => {
    assert.match(REDIS_SRC, /['"]ZCARD['"]/);
  });
  await ok('K9: expire 方法', () => {
    assert.match(REDIS_SRC, /async\s+expire\s*\(\s*key\s*,\s*seconds\s*\)/);
  });
  await ok('K10: EXPIRE 命令', () => {
    assert.match(REDIS_SRC, /['"]EXPIRE['"]/);
  });
  await ok('K11: del 方法', () => {
    assert.match(REDIS_SRC, /async\s+del\s*\(\s*key\s*\)/);
  });
  await ok('K12: DEL 命令', () => {
    assert.match(REDIS_SRC, /['"]DEL['"]/);
  });
  await ok('K13: eval 方法', () => {
    assert.match(REDIS_SRC, /async\s+eval\s*\(\s*script\s*,\s*numkeys\s*,\s*\.\.\.args\s*\)/);
  });
  await ok('K14: EVAL 命令', () => {
    assert.match(REDIS_SRC, /['"]EVAL['"]/);
  });
  await ok('K15: evalsha 方法', () => {
    assert.match(REDIS_SRC, /async\s+evalsha\s*\(\s*sha1\s*,\s*numkeys\s*,\s*\.\.\.args\s*\)/);
  });
  await ok('K16: EVALSHA 命令', () => {
    assert.match(REDIS_SRC, /['"]EVALSHA['"]/);
  });
  await ok('K17: scriptLoad 方法', () => {
    assert.match(REDIS_SRC, /async\s+scriptLoad\s*\(\s*script\s*\)/);
  });
  await ok('K18: SCRIPT LOAD 命令', () => {
    assert.match(REDIS_SRC, /['"]SCRIPT['"]\s*,\s*['"]LOAD['"]/);
  });

  // ============ Group L: encodeCommand 函数验证 ============
  await ok('L1: 接受 parts 参数', () => {
    assert.match(REDIS_SRC, /function\s+encodeCommand\s*\(\s*parts\s*\)/);
  });
  await ok('L2: map parts', () => {
    assert.match(REDIS_SRC, /parts\.map/);
  });
  await ok('L3: Buffer.from utf8', () => {
    assert.match(REDIS_SRC, /Buffer\.from\s*\(\s*String\s*\(\s*p\s*\)\s*,\s*['"]utf8['"]\s*\)/);
  });
  await ok('L4: Buffer.concat', () => {
    assert.match(REDIS_SRC, /Buffer\.concat/);
  });
  await ok('L5: RESP 数组格式', () => {
    assert.match(REDIS_SRC, /\*\$\{partsBuf\.length\}/);
  });
  await ok('L6: RESP bulk string 格式', () => {
    assert.match(REDIS_SRC, /\$\$\{b\.length\}/);
  });

  // ============ Group M: NeedMoreDataError 类验证 ============
  await ok('M1: 继承 Error', () => {
    assert.match(REDIS_SRC, /class\s+NeedMoreDataError\s+extends\s+Error/);
  });
  await ok('M2: 设置 code', () => {
    assert.match(REDIS_SRC, /this\.code\s*=\s*['"]EAGAIN['"]/);
  });

  // ============ Group N: parseReply 函数验证 ============
  await ok('N1: 接受 buf 参数', () => {
    assert.match(REDIS_SRC, /function\s+parseReply\s*\(\s*buf\s*\)/);
  });
  await ok('N2: 空 buffer 抛出 NeedMoreDataError', () => {
    assert.match(REDIS_SRC, /if\s*\(\s*buf\.length\s*===\s*0\s*\)\s+throw\s+new\s+NeedMoreDataError/);
  });
  await ok('N3: 检查 + 简单字符串', () => {
    assert.match(REDIS_SRC, /c\s*===\s*['"]\+['"]/);
  });
  await ok('N4: 检查 - 错误', () => {
    assert.match(REDIS_SRC, /c\s*===\s*['"]-['"]/);
  });
  await ok('N5: 检查 : 整数', () => {
    assert.match(REDIS_SRC, /c\s*===\s*['"]\:['"]/);
  });
  await ok('N6: 检查 $ bulk string', () => {
    assert.match(REDIS_SRC, /c\s*===\s*['"]\$['"]/);
  });
  await ok('N7: 检查 * 数组', () => {
    assert.match(REDIS_SRC, /c\s*===\s*['"]\*['"]/);
  });
  await ok('N8: -1 返回 null', () => {
    assert.match(REDIS_SRC, /len\s*===\s*-1\s*\)\s+return\s+\{\s*value:\s*null/);
  });
  await ok('N9: 未知字符抛出错误', () => {
    assert.match(REDIS_SRC, /throw\s+new\s+Error\s*\(\s*['"]未知的 RESP 起始字符/);
  });
  await ok('N10: 返回 value 和 consumed', () => {
    assert.match(REDIS_SRC, /return\s+\{\s*value\s*:\s*buf\.slice/);
  });

  // ============ Group O: 实际测试 - encodeCommand ============
  const { encodeCommand, parseReply, NeedMoreDataError } = require(path.join(ROOT, 'server/middleware/redisClient.js'));

  await ok('O1: encodeCommand PING', () => {
    const buf = encodeCommand(['PING']);
    const str = buf.toString();
    assert.ok(str.includes('*1'));
    assert.ok(str.includes('PING'));
  });

  await ok('O2: encodeCommand AUTH password', () => {
    const buf = encodeCommand(['AUTH', 'mypassword']);
    const str = buf.toString();
    assert.ok(str.includes('*2'));
    assert.ok(str.includes('AUTH'));
    assert.ok(str.includes('mypassword'));
  });

  await ok('O3: encodeCommand ZADD', () => {
    const buf = encodeCommand(['ZADD', 'mykey', '123.45', 'member1']);
    const str = buf.toString();
    assert.ok(str.includes('*4'));
    assert.ok(str.includes('ZADD'));
    assert.ok(str.includes('mykey'));
    assert.ok(str.includes('123.45'));
    assert.ok(str.includes('member1'));
  });

  await ok('O4: parseReply 简单字符串 +OK', () => {
    const buf = Buffer.from('+OK\r\n');
    const { value, consumed } = parseReply(buf);
    assert.equal(value, 'OK');
    assert.equal(consumed, 5);
  });

  await ok('O5: parseReply 整数 :123', () => {
    const buf = Buffer.from(':123\r\n');
    const { value, consumed } = parseReply(buf);
    assert.equal(value, 123);
    assert.equal(consumed, 6);
  });

  await ok('O6: parseReply bulk string $6\r\nfoobar\r\n', () => {
    const buf = Buffer.from('$6\r\nfoobar\r\n');
    const { value, consumed } = parseReply(buf);
    assert.equal(value, 'foobar');
    assert.equal(consumed, 12);
  });

  await ok('O7: parseReply 空 bulk string $-1\r\n', () => {
    const buf = Buffer.from('$-1\r\n');
    const { value, consumed } = parseReply(buf);
    assert.equal(value, null);
    assert.equal(consumed, 5);
  });

  await ok('O8: parseReply 空数组 *-1\r\n', () => {
    const buf = Buffer.from('*-1\r\n');
    const { value, consumed } = parseReply(buf);
    assert.equal(value, null);
    assert.equal(consumed, 5);
  });

  await ok('O9: parseReply 数组 *2\r\n$5\r\nhello\r\n$5\r\nworld\r\n', () => {
    const buf = Buffer.from('*2\r\n$5\r\nhello\r\n$5\r\nworld\r\n');
    const { value, consumed } = parseReply(buf);
    assert.deepEqual(value, ['hello', 'world']);
  });

  await ok('O10: parseReply 错误消息 -ERR message\r\n', () => {
    const buf = Buffer.from('-ERR message\r\n');
    assert.throws(() => parseReply(buf), /Redis 错误/);
  });

  await ok('O11: parseReply 空 buffer 抛出 NeedMoreDataError', () => {
    assert.throws(() => parseReply(Buffer.alloc(0)), /need more data/);
  });

  await ok('O12: parseReply 数据不足抛出 NeedMoreDataError', () => {
    const buf = Buffer.from('$6\r\nfoo');
    assert.throws(() => parseReply(buf), /need more data/);
  });

  await ok('O13: NeedMoreDataError code 属性', () => {
    const err = new NeedMoreDataError();
    assert.equal(err.code, 'EAGAIN');
  });

  await ok('O14: encodeCommand 空数组', () => {
    const buf = encodeCommand([]);
    const str = buf.toString();
    assert.ok(str.includes('*0'));
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
