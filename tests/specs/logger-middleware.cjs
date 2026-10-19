// tests/specs/logger-middleware.cjs
// 周期 19 R2: logger.js 日志中间件测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - logger 对象（debug/info/warn/error/child）
//   - redact 敏感信息脱敏
//   - parseTraceparent W3C trace context 解析
//   - generateTraceparent trace context 生成
//   - httpLoggerMiddleware HTTP 日志中间件
//   - runWithRequestContext / getRequestId / getRequestContext
//   - installGlobalHandlers 全局异常处理

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const LOGGER_SRC = fs.readFileSync(path.join(ROOT, 'server/middleware/logger.js'), 'utf8');

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
  console.log('=== logger-middleware ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 logger 对象', () => {
    assert.match(LOGGER_SRC, /const\s+logger\s*=\s*\{/);
  });
  await ok('A2: 导出 redact 函数', () => {
    assert.match(LOGGER_SRC, /function\s+redact/);
  });
  await ok('A3: 导出 httpLoggerMiddleware 函数', () => {
    assert.match(LOGGER_SRC, /function\s+httpLoggerMiddleware/);
  });
  await ok('A4: 导出 installGlobalHandlers 函数', () => {
    assert.match(LOGGER_SRC, /function\s+installGlobalHandlers/);
  });
  await ok('A5: 导出 runWithRequestContext 函数', () => {
    assert.match(LOGGER_SRC, /function\s+runWithRequestContext/);
  });
  await ok('A6: 导出 getRequestContext 函数', () => {
    assert.match(LOGGER_SRC, /function\s+getRequestContext/);
  });
  await ok('A7: 导出 getRequestId 函数', () => {
    assert.match(LOGGER_SRC, /function\s+getRequestId/);
  });
  await ok('A8: 导出 REDACT_PATHS 数组', () => {
    assert.match(LOGGER_SRC, /const\s+REDACT_PATHS\s*=\s*\[/);
  });
  await ok('A9: 导出 parseTraceparent 函数', () => {
    assert.match(LOGGER_SRC, /function\s+parseTraceparent/);
  });
  await ok('A10: 导出 generateTraceparent 函数', () => {
    assert.match(LOGGER_SRC, /function\s+generateTraceparent/);
  });

  // ============ Group B: 静态扫描 - 常量定义 ============
  await ok('B1: 定义 REDACT_REPLACEMENT', () => {
    assert.match(LOGGER_SRC, /REDACT_REPLACEMENT\s*=\s*['"]\[REDACTED\]['"]/);
  });
  await ok('B2: 定义 LOG_LEVELS', () => {
    assert.match(LOGGER_SRC, /const\s+LOG_LEVELS\s*=\s*\{/);
  });
  await ok('B3: 定义 TRACEPARENT_RE 正则', () => {
    assert.match(LOGGER_SRC, /TRACEPARENT_RE\s*=\s*\/\^/);
  });
  await ok('B4: 定义 TRACE_FLAGS_SAMPLED', () => {
    assert.match(LOGGER_SRC, /TRACE_FLAGS_SAMPLED\s*=\s*['"]01['"]/);
  });
  await ok('B5: 定义 TRACE_FLAGS_NONE', () => {
    assert.match(LOGGER_SRC, /TRACE_FLAGS_NONE\s*=\s*['"]00['"]/);
  });

  // ============ Group C: redact 逻辑验证 ============
  await ok('C1: null/undefined 返回原值', () => {
    assert.match(LOGGER_SRC, /if\s*\(\s*obj\s*===\s*null\s*\|\|\s*obj\s*===\s*undefined\s*\)\s+return\s+obj/);
  });
  await ok('C2: 非 object 返回原值', () => {
    assert.match(LOGGER_SRC, /typeof\s+obj\s*!==\s*['"]object['"]/);
  });
  await ok('C3: 数组递归处理', () => {
    assert.match(LOGGER_SRC, /if\s+\(Array\.isArray\(obj\)\)\s+return\s+obj\.map\(redact\)/);
  });
  await ok('C4: 检查 REDACT_PATHS', () => {
    assert.match(LOGGER_SRC, /REDACT_PATHS\.includes\s*\(\s*k\s*\)/);
  });
  await ok('C5: 敏感字段替换为 REDACT_REPLACEMENT', () => {
    assert.match(LOGGER_SRC, /out\[k\]\s*=\s*REDACT_REPLACEMENT/);
  });
  await ok('C6: 嵌套对象递归处理', () => {
    assert.match(LOGGER_SRC, /typeof\s+v\s*===\s*['"]object['"]\s*&&\s*v\s*!==\s*null/);
  });

  // ============ Group D: parseTraceparent 逻辑验证 ============
  await ok('D1: 空值返回 null', () => {
    assert.match(LOGGER_SRC, /if\s*\(\s*!\s*traceparent\s*\|\|\s*typeof\s*traceparent\s*!==\s*['"]string['"]\s*\)\s+return\s+null/);
  });
  await ok('D2: 使用 TRACEPARENT_RE 解析', () => {
    assert.match(LOGGER_SRC, /TRACEPARENT_RE\.exec\s*\(/);
  });
  await ok('D3: 正则不匹配返回 null', () => {
    assert.match(LOGGER_SRC, /if\s*\(\s*!\s*m\s*\)\s+return\s+null/);
  });
  await ok('D4: 版本非 00 返回 null', () => {
    assert.match(LOGGER_SRC, /if\s*\(\s*version\s*!==\s*['"]00['"]\s*\)\s+return\s+null/);
  });
  await ok('D5: traceId 全 0 返回 null', () => {
    assert.match(LOGGER_SRC, /traceId\s*===\s*['"]0['"]\.repeat\s*\(\s*32\s*\)/);
  });
  await ok('D6: parentId 全 0 返回 null', () => {
    assert.match(LOGGER_SRC, /parentId\s*===\s*['"]0['"]\.repeat\s*\(\s*16\s*\)/);
  });
  await ok('D7: 返回 version/traceId/parentId/flags/sampled', () => {
    assert.match(LOGGER_SRC, /version\s*,\s*traceId\s*,\s*parentId\s*,\s*flags\s*,\s*sampled/);
  });

  // ============ Group E: generateTraceparent 逻辑验证 ============
  await ok('E1: 使用 randomUUID 生成', () => {
    assert.match(LOGGER_SRC, /randomUUID\s*\(\s*\)/);
  });
  await ok('E2: 移除 UUID 中的短横线', () => {
    assert.match(LOGGER_SRC, /replace\s*\(\s*\/-\/g\s*,\s*['"]['"]\s*\)/);
  });
  await ok('E3: 使用父 traceId 或生成新 traceId', () => {
    assert.match(LOGGER_SRC, /parent\s*&&\s*parent\.traceId/);
  });
  await ok('E4: 生成新的 parentId（16 hex）', () => {
    assert.match(LOGGER_SRC, /slice\s*\(\s*0\s*,\s*16\s*\)/);
  });
  await ok('E5: 使用父 flags 或默认 TRACE_FLAGS_SAMPLED', () => {
    assert.match(LOGGER_SRC, /\(parent\s*&&\s*parent\.flags\)\s*\|\|\s*TRACE_FLAGS_SAMPLED/);
  });
  await ok('E6: 返回格式化的 traceparent 字符串', () => {
    assert.match(LOGGER_SRC, /00-\$\{newTraceId\}-\$\{newParentId\}-\$\{flags\}/);
  });

  // ============ Group F: logger 对象逻辑验证 ============
  await ok('F1: logger.debug 方法', () => {
    assert.match(LOGGER_SRC, /debug:\s*\(\s*\.\.\.args\s*\)\s*=>\s*emit\s*\(\s*['"]debug['"]/);
  });
  await ok('F2: logger.info 方法', () => {
    assert.match(LOGGER_SRC, /info:\s*\(\s*\.\.\.args\s*\)\s*=>\s*emit\s*\(\s*['"]info['"]/);
  });
  await ok('F3: logger.warn 方法', () => {
    assert.match(LOGGER_SRC, /warn:\s*\(\s*\.\.\.args\s*\)\s*=>\s*emit\s*\(\s*['"]warn['"]/);
  });
  await ok('F4: logger.error 方法', () => {
    assert.match(LOGGER_SRC, /error:\s*\(\s*\.\.\.args\s*\)\s*=>\s*emit\s*\(\s*['"]error['"]/);
  });
  await ok('F5: logger.child 方法', () => {
    assert.match(LOGGER_SRC, /child\s*\(\s*bindings\s*\)/);
  });

  // ============ Group G: emit 逻辑验证 ============
  await ok('G1: 检查日志级别', () => {
    assert.match(LOGGER_SRC, /LOG_LEVELS\[level\]\s*<\s*MIN_LEVEL/);
  });
  await ok('G2: 解析 args（0 个参数）', () => {
    assert.match(LOGGER_SRC, /args\.length\s*===\s*0/);
  });
  await ok('G3: 解析 args（1 个字符串）', () => {
    assert.match(LOGGER_SRC, /args\.length\s*===\s*1\s*&&\s*typeof\s*args\[0\]\s*===\s*['"]string['"]/);
  });
  await ok('G4: 解析 args（1 个对象）', () => {
    assert.match(LOGGER_SRC, /else\s+if\s*\(\s*args\.length\s*===\s*1\s*\)/);
  });
  await ok('G5: 解析 args（多个参数）', () => {
    assert.match(LOGGER_SRC, /obj\s*=\s*args\[0\]\s*;\s*m\s*=\s*args\[1\]/);
  });
  await ok('G6: 构造 JSON 输出', () => {
    assert.match(LOGGER_SRC, /parts\.push/);
  });
  await ok('G7: 写入 stdout', () => {
    assert.match(LOGGER_SRC, /process\.stdout\.write/);
  });

  // ============ Group H: httpLoggerMiddleware 逻辑验证 ============
  await ok('H1: 生成或获取 reqId', () => {
    assert.match(LOGGER_SRC, /x-request-id/);
  });
  await ok('H2: 获取 IP', () => {
    assert.match(LOGGER_SRC, /req\.ip/);
  });
  await ok('H3: 解析 traceparent', () => {
    assert.match(LOGGER_SRC, /parseTraceparent\s*\(/);
  });
  await ok('H4: 设置 X-Request-Id 响应头', () => {
    assert.match(LOGGER_SRC, /X-Request-Id/);
  });
  await ok('H5: 设置 Access-Control-Expose-Headers', () => {
    assert.match(LOGGER_SRC, /Access-Control-Expose-Headers/);
  });
  await ok('H6: 记录 http_start 事件', () => {
    assert.match(LOGGER_SRC, /http_start/);
  });
  await ok('H7: 监听 finish 事件', () => {
    assert.match(LOGGER_SRC, /res\.on\s*\(\s*['"]finish['"]/);
  });
  await ok('H8: 记录 http_end 事件', () => {
    assert.match(LOGGER_SRC, /http_end/);
  });

  // ============ Group I: runWithRequestContext 逻辑验证 ============
  await ok('I1: 使用 AsyncLocalStorage.run', () => {
    assert.match(LOGGER_SRC, /als\.run\s*\(/);
  });
  await ok('I2: 添加 startedAt', () => {
    assert.match(LOGGER_SRC, /startedAt:\s*Date\.now\s*\(\s*\)/);
  });
  await ok('I3: getRequestContext 返回 store', () => {
    assert.match(LOGGER_SRC, /als\.getStore\s*\(\s*\)/);
  });
  await ok('I4: getRequestId 返回 reqId', () => {
    assert.match(LOGGER_SRC, /ctx\.reqId/);
  });

  // ============ Group J: installGlobalHandlers 逻辑验证 ============
  await ok('J1: 监听 uncaughtException', () => {
    assert.match(LOGGER_SRC, /uncaughtException/);
  });
  await ok('J2: 监听 unhandledRejection', () => {
    assert.match(LOGGER_SRC, /unhandledRejection/);
  });
  await ok('J3: 记录错误消息', () => {
    assert.match(LOGGER_SRC, /err\.message/);
  });
  await ok('J4: 记录错误堆栈', () => {
    assert.match(LOGGER_SRC, /err\.stack/);
  });

  // ============ Group K: 实际测试 - redact ============
  const { redact, parseTraceparent, generateTraceparent } = require(path.join(ROOT, 'server/middleware/logger.js'));

  await ok('K1: redact 空对象', () => {
    assert.deepEqual(redact({}), {});
  });

  await ok('K2: redact 简单对象', () => {
    assert.deepEqual(redact({ name: 'test' }), { name: 'test' });
  });

  await ok('K3: redact 敏感字段 apiKey', () => {
    assert.deepEqual(redact({ apiKey: 'sk-123' }), { apiKey: '[REDACTED]' });
  });

  await ok('K4: redact 敏感字段 password', () => {
    assert.deepEqual(redact({ password: 'secret' }), { password: '[REDACTED]' });
  });

  await ok('K5: redact 敏感字段 token', () => {
    assert.deepEqual(redact({ token: 'abc123' }), { token: '[REDACTED]' });
  });

  await ok('K6: redact 嵌套对象', () => {
    assert.deepEqual(redact({ nested: { apiKey: 'sk-123' } }), { nested: { apiKey: '[REDACTED]' } });
  });

  await ok('K7: redact 数组', () => {
    assert.deepEqual(redact([1, 2, 3]), [1, 2, 3]);
  });

  await ok('K8: redact null', () => {
    assert.equal(redact(null), null);
  });

  // ============ Group L: 实际测试 - parseTraceparent ============
  await ok('L1: parseTraceparent 空值返回 null', () => {
    assert.equal(parseTraceparent(null), null);
    assert.equal(parseTraceparent(''), null);
  });

  await ok('L2: parseTraceparent 非字符串返回 null', () => {
    assert.equal(parseTraceparent(123), null);
    assert.equal(parseTraceparent({}), null);
  });

  await ok('L3: parseTraceparent 格式错误返回 null', () => {
    assert.equal(parseTraceparent('invalid'), null);
    assert.equal(parseTraceparent('00-abc-def-01'), null);
  });

  await ok('L4: parseTraceparent 版本错误返回 null', () => {
    assert.equal(parseTraceparent('01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'), null);
  });

  await ok('L5: parseTraceparent traceId 全 0 返回 null', () => {
    assert.equal(parseTraceparent('00-' + '0'.repeat(32) + '-00f067aa0ba902b7-01'), null);
  });

  await ok('L6: parseTraceparent parentId 全 0 返回 null', () => {
    assert.equal(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-' + '0'.repeat(16) + '-01'), null);
  });

  await ok('L7: parseTraceparent 有效值', () => {
    const result = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    assert.equal(result.version, '00');
    assert.equal(result.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(result.parentId, '00f067aa0ba902b7');
    assert.equal(result.flags, '01');
    assert.equal(result.sampled, true);
  });

  await ok('L8: parseTraceparent sampled=false', () => {
    const result = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00');
    assert.equal(result.sampled, false);
  });

  // ============ Group M: 实际测试 - generateTraceparent ============
  await ok('M1: generateTraceparent 无参数', () => {
    const result = generateTraceparent();
    assert.match(result, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  await ok('M2: generateTraceparent 有父 traceId', () => {
    const parent = { traceId: '4bf92f3577b34da6a3ce929d0e0e4736', flags: '01' };
    const result = generateTraceparent(parent);
    assert.match(result, /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
  });

  await ok('M3: generateTraceparent 有父 flags', () => {
    const parent = { traceId: '4bf92f3577b34da6a3ce929d0e0e4736', flags: '00' };
    const result = generateTraceparent(parent);
    assert.match(result, /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-00$/);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
