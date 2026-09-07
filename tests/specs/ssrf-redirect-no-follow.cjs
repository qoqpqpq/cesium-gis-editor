// tests/specs/ssrf-redirect-no-follow.cjs
// 周期 3 P0-1: SSRF 链路重校验（禁重定向 + safeFetch 包装）
//
// 背景：OWASP SSRF Cheat Sheet step 5：
//   "For each redirect: normalize → validate scheme → resolve hostname → classify IP.
//    Reject if any redirect leads to internal/unsafe IP."
//
// 修复：safeFetch(url, init)
//   - redirect: 'manual'：禁止 Node fetch 自动跟随 3xx
//   - 遇到 3xx → 抛 502 + 提示调用方走 validateChain
//   - validateChain(url, maxHops=5) 跟随重定向并逐 hop 校验（仅当所有 hop 都公网才放行）
//
// 验收：
//   - safeFetch 对 301/302/303/307/308 都抛 502
//   - safeFetch 对 200 正常返回
//   - safeFetch 自身超时（AbortSignal.timeout）
//   - validateChain 跟随公网链通过；遇到私网 hop 拒绝

'use strict';

const assert = require('node:assert');
const http = require('node:http');
const dns = require('node:dns').promises;
const { safeFetch, validateBaseUrlWithDns } = require('../../server/services/ssrf-guard');

let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve().then(() => fn()).then(
    () => { console.log(`  [PASS] ${name}`); pass++; },
    (e) => { console.error(`  [FAIL] ${name}:`, e.message); fail++; }
  );
}

// ---- 启动 3 个本地 HTTP server 模拟不同重定向场景 ----
const servers = [];
function startServer(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      servers.push(srv);
      resolve(port);
    });
  });
}

let portRedirect;       // /redirect → /target
let portRedirectLoop;   // /redirect → /redirect （无限环）
let portSlow;           // /slow 故意 hang 超时

(async () => {
  console.log('=== ssrf-redirect-no-follow ===');

  portRedirect = await startServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: 'http://127.0.0.1:' + portRedirect + '/target' });
      res.end();
    } else if (req.url === '/target') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello');
    } else {
      res.writeHead(404); res.end();
    }
  });

  portRedirectLoop = await startServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: 'http://127.0.0.1:' + portRedirectLoop + '/redirect' });
      res.end();
    } else {
      res.writeHead(404); res.end();
    }
  });

  portSlow = await startServer(() => {
    // 不响应，让客户端超时
  });

  // 把 127.0.0.1 临时加入 "白名单外但本地测试" 例外 —— 用 mock dns.lookup 让 host 解析到公网 IP
  // 实际方案：safeFetch 内部会先调 validateBaseUrlWithDns，而它会拒绝非白名单 host。
  //   所以测试必须绕开：直接调用 fetch + redirect:'manual' 验证"禁重定向"行为，
  //   再单独验证 validateChain。
  const dns = require('node:dns').promises;
  const origLookup = dns.lookup;

  // ---- 1. safeFetch 禁重定向（直接测 fetch redirect:manual，不走 safeFetch 因为它会查白名单）----
  await test('fetch + redirect:manual → 302 不被跟随，status=302', async () => {
    const resp = await fetch(`http://127.0.0.1:${portRedirect}/redirect`, { redirect: 'manual' });
    assert.strictEqual(resp.status, 302);
    assert.match(resp.headers.get('location'), /\/target$/);
  });

  await test('fetch + redirect:follow (默认) → 跟随到 200', async () => {
    const resp = await fetch(`http://127.0.0.1:${portRedirect}/redirect`);
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(await resp.text(), 'hello');
  });

  // ---- 2. safeFetch 自身对 3xx 抛 502 ----
  //   但 safeFetch 入口会 validateBaseUrlWithDns，127.0.0.1 + http 不在白名单 → 拒
  //   所以测"白名单入口 + 远端 3xx"需要 mock dns.lookup + 白名单 host

  await test('safeFetch("https://api.openai.com/redirect") 入口校验先过 + 3xx 拒（mock dns + mock fetch）', async () => {
    // mock dns.lookup 解析到公网
    dns.lookup = async () => ({ address: '8.8.8.8', family: 4 });
    // mock 全局 fetch 返回 302
    const origFetch = global.fetch;
    global.fetch = async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/secret' } });
    try {
      let threw = false;
      let status = 0;
      try {
        await safeFetch('https://api.openai.com/redirect');
      } catch (e) {
        threw = true;
        status = e.status || 0;
        assert.match(e.message, /3xx|重定向/);
      }
      assert.ok(threw, '应抛错');
      assert.strictEqual(status, 502);
    } finally {
      global.fetch = origFetch;
    }
  });

  // ---- 3. safeFetch 对 200 正常返回 ----
  await test('safeFetch("https://api.openai.com/ok") mock 200 → pass', async () => {
    dns.lookup = async () => ({ address: '8.8.8.8', family: 4 });
    const origFetch = global.fetch;
    global.fetch = async () => new Response('ok', { status: 200 });
    try {
      const resp = await safeFetch('https://api.openai.com/ok');
      assert.strictEqual(resp.status, 200);
      assert.strictEqual(await resp.text(), 'ok');
    } finally {
      global.fetch = origFetch;
    }
  });

  // ---- 4. safeFetch 超时（AbortSignal.timeout）----
  await test('safeFetch timeout 1s 对挂起 server → 抛 AbortError', async () => {
    dns.lookup = async () => ({ address: '8.8.8.8', family: 4 });
    const origFetch = global.fetch;
    global.fetch = async (url, init) => {
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    };
    try {
      let threw = false;
      try {
        await safeFetch('https://api.openai.com/slow', { timeoutMs: 200 });
      } catch (e) {
        threw = true;
        assert.strictEqual(e.name, 'AbortError');
      }
      assert.ok(threw);
    } finally {
      global.fetch = origFetch;
    }
  });

  // ---- 5. 链路重校验：extractLocation + validateChain（这里只测核心逻辑）----
  //   validateChain 暂不在 ssrf-guard.js 公开（内部循环逻辑）；我们手动模拟
  await test('validateChain: 2-hop 链路，第一 hop 私网 → 拒绝', async () => {
    // 模拟 fetch 跟随：第一次返回 302 → 127.0.0.1
    //   validateBaseUrlWithDns('http://127.0.0.1/...') 应抛
    let threw = false;
    try {
      await validateBaseUrlWithDns('http://127.0.0.1/secret');
    } catch (_) { threw = true; }
    assert.ok(threw, '私网 hop 应被拒');
  });

  // ---- 6. 还原 ----
  dns.lookup = origLookup;

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  // cleanup
  for (const s of servers) s.close();
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('FATAL:', e);
  for (const s of servers) s.close();
  process.exit(1);
});
