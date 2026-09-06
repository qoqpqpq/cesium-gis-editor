// tests/probe-real-ai-tool-first.cjs
// 验证 /api/ai/agent 端点对"非流式 + 非法/不完整 body"的行为契约
//
// 设计目的：
//   - 周期主调度没有真实 API Key，所以本测试不真正去转发到 LLM 厂商
//   - 只验证：缺字段、错 platform、缺 api_key 时的 4xx 路径与错误信息
//   - 若端点意外返 200/500，则记为 FAIL（在 lessons 跟进）
//
// 模式：
//   默认 = 只读探活（不失败）。--strict 模式把任何错误响应以外的状况判为 FAIL。
//
// 退出码：
//   0 = 全部符合契约
//   1 = 任一用例违反契约（--strict 时）
//   2 = 致命（请求层失败）

'use strict';

const http = require('http');

const SERVER = process.env.SERVER_URL || 'http://localhost:3001';
const STRICT = process.argv.includes('--strict');

let passes = 0;
let fails = 0;

function record(name, ok, detail) {
  const tag = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
  if (ok) passes += 1; else fails += 1;
}

function httpJson(method, p, body, timeoutMs = 8000) {
  const u = new URL(p, SERVER);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: timeoutMs,
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf); } catch (_) { /* keep null */ }
          resolve({ status: res.statusCode || 0, json, raw: buf });
        });
      }
    );
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (body != null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function run() {
  process.stdout.write(`\n=== probe-real-ai-tool-first @ ${SERVER} (strict=${STRICT}) ===\n`);

  // Case A: 空 body → 400 "platform / messages 必填"
  {
    const r = await httpJson('POST', '/api/ai/agent', {}, 5000);
    const ok = r.status === 400 && r.json && r.json.success === false
      && /platform|platform \/ messages/.test(r.json.message || '');
    record('A) POST /api/ai/agent 空 body → 400', ok, `status=${r.status} msg=${r.json && r.json.message}`);
  }

  // Case B: 缺 messages → 400
  {
    const r = await httpJson('POST', '/api/ai/agent', { platform: 'openai' }, 5000);
    const ok = r.status === 400 && r.json && r.json.success === false;
    record('B) POST /api/ai/agent 缺 messages → 400', ok, `status=${r.status} msg=${r.json && r.json.message}`);
  }

  // Case C: 非法 platform → 不应返 5xx；行为取决于实现（抛 400 或上游 4xx），我们只断言不是 5xx
  {
    const r = await httpJson('POST', '/api/ai/agent', {
      platform: '__not_a_real_platform__',
      messages: [{ role: 'user', content: 'ping' }],
    }, 6000);
    const ok = r.status < 500;
    record('C) POST /api/ai/agent 非法 platform → 非 5xx', ok, `status=${r.status} msg=${r.json && r.json.message}`);
  }

  // Case D: 流式端点 ?stream=1 空 body → 400
  {
    const r = await httpJson('POST', '/api/ai/agent?stream=1', {}, 5000);
    // 流式端点直接 res.status(400).json(...)
    const ok = r.status === 400 && r.json && r.json.success === false;
    record('D) POST /api/ai/agent?stream=1 空 body → 400', ok, `status=${r.status} msg=${r.json && r.json.message}`);
  }

  // Case E: 走 OpenAI 但 tempApiKey 缺失 → 应走到 getKey → 抛 400/500（不返 200）
  // 现实里这就是"用户没配 key"的真实路径；CI 里我们只断言 != 200
  {
    const r = await httpJson('POST', '/api/ai/agent', {
      platform: 'openai',
      messages: [{ role: 'user', content: 'ping' }],
    }, 8000);
    const ok = r.status !== 200;
    record('E) POST /api/ai/agent 无 api_key → 非 200', ok, `status=${r.status} msg=${r.json && r.json.message}`);
  }

  // Case F: chat/stream 空 body → 400
  {
    const r = await httpJson('POST', '/api/ai/chat/stream', {}, 5000);
    const ok = r.status === 400 && r.json && r.json.success === false;
    record('F) POST /api/ai/chat/stream 空 body → 400', ok, `status=${r.status} msg=${r.json && r.json.message}`);
  }

  process.stdout.write(`\n--- summary: pass=${passes} fail=${fails} ---\n`);
  if (STRICT && fails > 0) process.exit(1);
}

run().catch((e) => {
  process.stderr.write(`fatal: ${e && e.message}\n`);
  process.exit(2);
});
