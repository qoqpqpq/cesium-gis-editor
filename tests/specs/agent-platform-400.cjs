// tests/specs/agent-platform-400.cjs
// 周期 2 P0-5: 验证 /api/ai/agent 对未知 platform 返回 400 而非 500
//
// 背景：周期 1 probe-real-ai-tool-first.cjs 报告 B01：
//   - aiService.chat() 抛"不支持的平台"时未带 e.status
//   - agent 路由 catch 后统一 res.status(500)
//   - 前端 alert 会把"未知 platform"显示成"服务器内部错误"
//
// 修复：
//   - chat() / chatStream() 对未知 platform 带 e.status = 400
//   - agent 路由层 catch 用 e.status || 500
//   - _sse.js 错误事件透传 status 字段（默认 500）
//
// 验收：
//   - 直接 require ai service，验证 chat() 抛错带 .status === 400
//   - 启动 server 端到端验证 HTTP status 是 400

'use strict';

const assert = require('node:assert');
const http = require('node:http');

const aiService = require('../../server/services/ai');

let pass = 0;
let fail = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`  [PASS] ${name}`); pass++; })
    .catch((e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; });
}

(async () => {
  console.log('=== agent-platform-400 ===');

  // ---- 单元：aiService.chat() 抛错带 status ----
  await test('chat() 抛"未知 platform"带 e.status=400', async () => {
    let caught;
    try {
      await aiService.chat('__not_a_real_platform__', [
        { role: 'user', content: 'hi' },
      ]);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, '应当抛出错误');
    assert.strictEqual(caught.status, 400, `e.status 应为 400，实际 ${caught.status}`);
    assert.match(caught.message, /不支持的平台/);
  });

  await test('chatStream() 抛"未知 platform"带 e.status=400', async () => {
    let caught;
    try {
      await aiService.chatStream('__not_a_real_platform__', [
        { role: 'user', content: 'hi' },
      ], {}, () => {}, null, [], null);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, '应当抛出错误');
    assert.strictEqual(caught.status, 400, `e.status 应为 400，实际 ${caught.status}`);
    assert.match(caught.message, /不支持的平台/);
  });

  await test('chat() 已知 platform 缺 key 仍带 e.status=400（回归）', async () => {
    let caught;
    try {
      // openai 是已知 platform，缺 key 应 400
      await aiService.chat('openai', [
        { role: 'user', content: 'hi' },
      ], {}, [], null);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught);
    assert.strictEqual(caught.status, 400);
    assert.match(caught.message, /未提供 AI Key/);
  });

  // ---- 端到端：HTTP 实际返回 400 ----
  // 用 checkpoint 跑过的同端口；如未启动 server，则跳过 e2e
  await test('HTTP POST /api/ai/agent 未知 platform → 400', async () => {
    const status = await postJson('http://127.0.0.1:3001/api/ai/agent', {
      platform: '__not_a_real_platform__',
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.strictEqual(status, 400, `HTTP status 应为 400，实际 ${status}`);
  }).catch((e) => {
    // server 未启动时不 fail，单元测试已覆盖
    if (/ECONNREFUSED|ENOTFOUND/.test(e.message)) {
      console.log(`  [SKIP] HTTP e2e（server 未启动）：${e.message}`);
    } else {
      throw e;
    }
  });

  await test('HTTP POST /api/ai/agent 缺 platform → 400（回归）', async () => {
    const status = await postJson('http://127.0.0.1:3001/api/ai/agent', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.strictEqual(status, 400);
  }).catch((e) => {
    if (/ECONNREFUSED|ENOTFOUND/.test(e.message)) {
      console.log(`  [SKIP] HTTP e2e（server 未启动）：${e.message}`);
    } else {
      throw e;
    }
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  if (fail > 0) process.exit(1);
})();

function postJson(urlString, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(data),
      },
      timeout: 8000,
    }, (res) => {
      res.on('data', () => {}); // drain
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}
