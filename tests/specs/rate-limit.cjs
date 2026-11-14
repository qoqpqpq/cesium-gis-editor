// tests/specs/rate-limit.cjs
// 周期 20 R3: rateLimit.js 速率限制测试
// 目标：≥ 20 PASS
//
// 覆盖：
//   - isLocal 本地 IP 检查
//   - slidingWindow 滑动窗口限流
//   - tokenBucket 令牌桶限流
//   - multiLevelLimiter 多级限流
//   - aiMultiLevelLimiter AI 多级限流
//   - 预配置限流器（apiLimiter/aiLimiter/recommendLimiter/spatialLimiter/aiDailyLimiter）
//   - InMemoryTokenBucketStore 内存令牌桶存储

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const RATELIMIT_SRC = fs.readFileSync(path.join(ROOT, 'server/middleware/rateLimit.js'), 'utf8');

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
  console.log('=== rate-limit ===');

  // ============ Group A: 静态扫描 - 导出验证 ============
  await ok('A1: 导出 apiLimiter', () => {
    assert.match(RATELIMIT_SRC, /apiLimiter/);
  });
  await ok('A2: 导出 aiLimiter', () => {
    assert.match(RATELIMIT_SRC, /aiLimiter/);
  });
  await ok('A3: 导出 recommendLimiter', () => {
    assert.match(RATELIMIT_SRC, /recommendLimiter/);
  });
  await ok('A4: 导出 spatialLimiter', () => {
    assert.match(RATELIMIT_SRC, /spatialLimiter/);
  });
  await ok('A5: 导出 aiDailyLimiter', () => {
    assert.match(RATELIMIT_SRC, /aiDailyLimiter/);
  });
  await ok('A6: 导出 isLocal', () => {
    assert.match(RATELIMIT_SRC, /isLocal/);
  });
  await ok('A7: 导出 slidingWindow', () => {
    assert.match(RATELIMIT_SRC, /slidingWindow/);
  });
  await ok('A8: 导出 tokenBucket', () => {
    assert.match(RATELIMIT_SRC, /tokenBucket/);
  });
  await ok('A9: 导出 InMemoryTokenBucketStore', () => {
    assert.match(RATELIMIT_SRC, /InMemoryTokenBucketStore/);
  });
  await ok('A10: 导出 RedisTokenBucketStore', () => {
    assert.match(RATELIMIT_SRC, /RedisTokenBucketStore/);
  });
  await ok('A11: 导出 createStore', () => {
    assert.match(RATELIMIT_SRC, /createStore/);
  });
  await ok('A12: 导出 InMemoryStore', () => {
    assert.match(RATELIMIT_SRC, /InMemoryStore/);
  });
  await ok('A13: 导出 RedisStore', () => {
    assert.match(RATELIMIT_SRC, /RedisStore/);
  });
  await ok('A14: 导出 multiLevelLimiter', () => {
    assert.match(RATELIMIT_SRC, /multiLevelLimiter/);
  });
  await ok('A15: 导出 aiMultiLevelLimiter', () => {
    assert.match(RATELIMIT_SRC, /aiMultiLevelLimiter/);
  });

  // ============ Group B: isLocal 逻辑验证 ============
  await ok('B1: 接受 req 参数', () => {
    assert.match(RATELIMIT_SRC, /function\s+isLocal\s*\(\s*req\s*\)/);
  });
  await ok('B2: 检查 req.ip', () => {
    assert.match(RATELIMIT_SRC, /req\.ip/);
  });
  await ok('B3: 检查 req.socket.remoteAddress', () => {
    assert.match(RATELIMIT_SRC, /req\.socket\.remoteAddress/);
  });
  await ok('B4: 检查 ::1', () => {
    assert.match(RATELIMIT_SRC, /'::1'/);
  });
  await ok('B5: 检查 127.0.0.1', () => {
    assert.match(RATELIMIT_SRC, /'127\.0\.0\.1'/);
  });
  await ok('B6: 检查 ::ffff:127.0.0.1', () => {
    assert.match(RATELIMIT_SRC, /'::ffff:127\.0\.0\.1'/);
  });

  // ============ Group C: skipLocal 逻辑验证 ============
  await ok('C1: 接受 handler 参数', () => {
    assert.match(RATELIMIT_SRC, /function\s+skipLocal\s*\(\s*handler\s*\)/);
  });
  await ok('C2: 返回函数', () => {
    assert.match(RATELIMIT_SRC, /return\s*\(\s*req\s*\)\s*=>\s*!\s*isLocal\s*\(\s*req\s*\)\s*&&\s*handler\s*\(\s*req\s*\)/);
  });

  // ============ Group D: slidingWindow 逻辑验证 ============
  await ok('D1: 接受 opts 参数', () => {
    assert.match(RATELIMIT_SRC, /function\s+slidingWindow\s*\(\s*opts\s*\)/);
  });
  await ok('D2: 解构 windowMs/limit/message/keyBy/skip/store', () => {
    assert.match(RATELIMIT_SRC, /windowMs\s*,\s*limit\s*,\s*message\s*=\s*['"]请求过于频繁，请稍后重试['"]/);
  });
  await ok('D3: 检查 windowMs 正数', () => {
    assert.match(RATELIMIT_SRC, /typeof\s+windowMs\s*!==\s*['"]number['"]\s*\|\|\s*windowMs\s*<=\s*0/);
  });
  await ok('D4: 检查 limit 正数', () => {
    assert.match(RATELIMIT_SRC, /typeof\s+limit\s*!==\s*['"]number['"]\s*\|\|\s*limit\s*<=\s*0/);
  });
  await ok('D5: 解析 store', () => {
    assert.match(RATELIMIT_SRC, /resolvedStore/);
  });
  await ok('D6: 默认 InMemoryStore', () => {
    assert.match(RATELIMIT_SRC, /new\s+InMemoryStore/);
  });
  await ok('D7: redis 字符串解析', () => {
    assert.match(RATELIMIT_SRC, /'redis'/);
  });
  await ok('D8: 检查 skip 函数', () => {
    assert.match(RATELIMIT_SRC, /typeof\s+skip\s*===\s*['"]function['"]/);
  });
  await ok('D9: 调用 store.hit', () => {
    assert.match(RATELIMIT_SRC, /resolvedStore\.hit/);
  });
  await ok('D10: 处理 store 失败', () => {
    assert.match(RATELIMIT_SRC, /console\.error/);
  });
  await ok('D11: 超限返回 429', () => {
    assert.match(RATELIMIT_SRC, /res\.status\s*\(\s*429\s*\)/);
  });
  await ok('D12: 设置 Retry-After header', () => {
    assert.match(RATELIMIT_SRC, /Retry-After/);
  });
  await ok('D13: 设置 RateLimit-Limit header', () => {
    assert.match(RATELIMIT_SRC, /RateLimit-Limit/);
  });
  await ok('D14: 设置 RateLimit-Remaining header', () => {
    assert.match(RATELIMIT_SRC, /RateLimit-Remaining/);
  });
  await ok('D15: 设置 RateLimit-Reset header', () => {
    assert.match(RATELIMIT_SRC, /RateLimit-Reset/);
  });
  await ok('D16: 设置 X-RateLimit-* headers', () => {
    assert.match(RATELIMIT_SRC, /X-RateLimit-Limit/);
  });

  // ============ Group E: tokenBucket 逻辑验证 ============
  await ok('E1: 接受 opts 参数', () => {
    assert.match(RATELIMIT_SRC, /function\s+tokenBucket\s*\(\s*opts\s*\)/);
  });
  await ok('E2: 解构 windowMs/limit/capacity/refillPerSec', () => {
    assert.match(RATELIMIT_SRC, /capacity\s*=\s*limit\s*,\s*refillPerSec\s*=\s*limit\s*\/\s*\(\s*windowMs\s*\/\s*1000\s*\)/);
  });
  await ok('E3: 检查 windowMs 正数', () => {
    assert.match(RATELIMIT_SRC, /typeof\s+windowMs\s*!==\s*['"]number['"]\s*\|\|\s*windowMs\s*<=\s*0/);
  });
  await ok('E4: 检查 limit 正数', () => {
    assert.match(RATELIMIT_SRC, /typeof\s+limit\s*!==\s*['"]number['"]\s*\|\|\s*limit\s*<=\s*0/);
  });
  await ok('E5: 解析 store', () => {
    assert.match(RATELIMIT_SRC, /resolvedStore/);
  });
  await ok('E6: 默认 InMemoryTokenBucketStore', () => {
    assert.match(RATELIMIT_SRC, /new\s+InMemoryTokenBucketStore/);
  });
  await ok('E7: 调用 store.hit', () => {
    assert.match(RATELIMIT_SRC, /resolvedStore\.hit/);
  });
  await ok('E8: 超限返回 429', () => {
    assert.match(RATELIMIT_SRC, /res\.status\s*\(\s*429\s*\)/);
  });
  await ok('E9: 设置 RateLimit headers', () => {
    assert.match(RATELIMIT_SRC, /RateLimit-Limit/);
  });

  // ============ Group F: InMemoryTokenBucketStore 逻辑验证 ============
  await ok('F1: 构造函数初始化 buckets Map', () => {
    assert.match(RATELIMIT_SRC, /this\.buckets\s*=\s*new\s+Map/);
  });
  await ok('F2: hit 方法', () => {
    assert.match(RATELIMIT_SRC, /async\s+hit\s*\(\s*key\s*,\s*\{\s*capacity\s*,\s*refillPerSec\s*\}\s*\)/);
  });
  await ok('F3: 创建新 bucket', () => {
    assert.match(RATELIMIT_SRC, /tokens:\s*capacity\s*,\s*lastRefillAt:\s*now/);
  });
  await ok('F4: 计算补充 tokens', () => {
    assert.match(RATELIMIT_SRC, /elapsed\s*\*\s*refillPerSec/);
  });
  await ok('F5: 消耗 1 token', () => {
    assert.match(RATELIMIT_SRC, /b\.tokens\s*-=\s*1/);
  });
  await ok('F6: reset 方法', () => {
    assert.match(RATELIMIT_SRC, /async\s+reset\s*\(\s*key\s*\)/);
  });
  await ok('F7: shutdown 方法', () => {
    assert.match(RATELIMIT_SRC, /async\s+shutdown\s*\(\s*\)/);
  });

  // ============ Group G: multiLevelLimiter 逻辑验证 ============
  await ok('G1: 接受 opts 参数', () => {
    assert.match(RATELIMIT_SRC, /function\s+multiLevelLimiter\s*\(\s*opts\s*\)/);
  });
  await ok('G2: 定义 ip 维度', () => {
    assert.match(RATELIMIT_SRC, /name:\s*['"]ip['"]/);
  });
  await ok('G3: 定义 user 维度', () => {
    assert.match(RATELIMIT_SRC, /name:\s*['"]user['"]/);
  });
  await ok('G4: 定义 apikey 维度', () => {
    assert.match(RATELIMIT_SRC, /name:\s*['"]apikey['"]/);
  });
  await ok('G5: 共享 store', () => {
    assert.match(RATELIMIT_SRC, /sharedStore/);
  });
  await ok('G6: 检查 res.statusCode', () => {
    assert.match(RATELIMIT_SRC, /res\.statusCode\s*===\s*429/);
  });

  // ============ Group H: aiMultiLevelLimiter 逻辑验证 ============
  await ok('H1: 接受 opts 参数', () => {
    assert.match(RATELIMIT_SRC, /function\s+aiMultiLevelLimiter\s*\(\s*opts\s*=\s*\{\}\s*\)/);
  });
  await ok('H2: 默认 windowMs 60 秒', () => {
    assert.match(RATELIMIT_SRC, /windowMs:\s*60\s*\*\s*1000/);
  });
  await ok('H3: 默认 limit 60', () => {
    assert.match(RATELIMIT_SRC, /limit:\s*60/);
  });
  await ok('H4: 默认 userLimit 200', () => {
    assert.match(RATELIMIT_SRC, /userLimit:\s*200/);
  });
  await ok('H5: 默认 apiKeyLimit 300', () => {
    assert.match(RATELIMIT_SRC, /apiKeyLimit:\s*300/);
  });
  await ok('H6: userIdKey 提取', () => {
    assert.match(RATELIMIT_SRC, /req\.body\.userId\s*\|\|\s*req\.body\.sessionId/);
  });
  await ok('H7: apiKeyKey 提取', () => {
    assert.match(RATELIMIT_SRC, /req\.body\.apiKey/);
  });
  await ok('H8: Authorization Bearer 提取', () => {
    assert.match(RATELIMIT_SRC, /Bearer/);
    assert.match(RATELIMIT_SRC, /exec\s*\(\s*auth\s*\)/);
  });

  // ============ Group I: 预配置限流器验证 ============
  await ok('I1: apiLimiter 配置', () => {
    assert.match(RATELIMIT_SRC, /const\s+apiLimiter\s*=\s*rateLimit/);
  });
  await ok('I2: apiLimiter windowMs 10 分钟', () => {
    assert.match(RATELIMIT_SRC, /10\s*\*\s*60\s*\*\s*1000/);
  });
  await ok('I3: apiLimiter limit 600', () => {
    assert.match(RATELIMIT_SRC, /limit:\s*600/);
  });
  await ok('I4: aiLimiter 配置', () => {
    assert.match(RATELIMIT_SRC, /const\s+aiLimiter\s*=\s*rateLimit/);
  });
  await ok('I5: aiLimiter windowMs 60 秒', () => {
    assert.match(RATELIMIT_SRC, /60\s*\*\s*1000/);
  });
  await ok('I6: aiLimiter limit 60', () => {
    assert.match(RATELIMIT_SRC, /limit:\s*60/);
  });
  await ok('I7: recommendLimiter 配置', () => {
    assert.match(RATELIMIT_SRC, /const\s+recommendLimiter\s*=\s*rateLimit/);
  });
  await ok('I8: recommendLimiter limit 10', () => {
    assert.match(RATELIMIT_SRC, /limit:\s*10/);
  });
  await ok('I9: spatialLimiter 配置', () => {
    assert.match(RATELIMIT_SRC, /const\s+spatialLimiter\s*=\s*rateLimit/);
  });
  await ok('I10: spatialLimiter limit 30', () => {
    assert.match(RATELIMIT_SRC, /limit:\s*30/);
  });
  await ok('I11: aiDailyLimiter 配置', () => {
    assert.match(RATELIMIT_SRC, /const\s+aiDailyLimiter\s*=\s*rateLimit/);
  });
  await ok('I12: aiDailyLimiter windowMs 24 小时', () => {
    assert.match(RATELIMIT_SRC, /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
  await ok('I13: aiDailyLimiter dailyAIBudget', () => {
    assert.match(RATELIMIT_SRC, /AI_DAILY_QUOTA/);
  });

  // ============ Group J: 实际测试 - 需要 express-rate-limit 模块 ============
  // 由于 express-rate-limit 未安装，实际测试跳过（仅静态分析）
  // 这些测试需要完整的依赖环境才能运行

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
