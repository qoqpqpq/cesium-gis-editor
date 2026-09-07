// tests/helpers/with-server.cjs
// 周期 5 P0-3: spec helper —— 自动启 server / 跑 fn / 关 server
//
// 背景：周期 4 P2-1 helmet 8.x 升级后，helmet-8-upgrade.cjs spec 依赖外部 server
//   （在 3001 跑）。但实际开发中常被其他 server 占用 / 旧版本未重启导致 spec 失败。
//
// helper：
//   withFreshServer(fn, { port = 3201, env = {} })
//     - spawn child_process 启 server（用 node 跑 server/index.js）
//     - 等 serverUp（poll /api/health 到 200）
//     - 跑 fn()，fn 拿 { port, host, baseUrl }
//     - 收尾：kill child process
//
// 用法：
//   const withFreshServer = require('./helpers/with-server');
//   await withFreshServer(async ({ port }) => {
//     // ... 跑测试
//   });

'use strict';

const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const DEFAULT_PORT = 3201;
const STARTUP_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpHealth(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: host, port, path: '/api/health', method: 'GET', timeout: 1500 },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('health timeout')));
    req.end();
  });
}

async function waitForServer(port, host, timeoutMs) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const code = await httpHealth(port, host);
      if (code === 200) return true;
    } catch (e) {
      lastErr = e;
    }
    await sleep(200);
  }
  throw new Error('server 在 ' + timeoutMs + 'ms 内未启动: ' + (lastErr && lastErr.message));
}

/**
 * 启动一个新鲜的 server 子进程，跑 fn，然后 kill
 * @param {() => Promise<void>} fn
 * @param {object} opts
 * @param {number} [opts.port=3201]
 * @param {string} [opts.host='127.0.0.1']
 * @param {string} [opts.cwd] — 默认为本仓库根
 * @param {object} [opts.env] — 额外环境变量
 * @returns {Promise<any>}
 */
async function withFreshServer(fn, opts = {}) {
  const port = opts.port || DEFAULT_PORT;
  const host = opts.host || '127.0.0.1';
  const cwd = opts.cwd || path.resolve(__dirname, '..', '..');
  const extraEnv = opts.env || {};
  const env = {
    ...process.env,
    ...extraEnv,
    PORT: String(port),
    HOST: host,
    NODE_ENV: extraEnv.NODE_ENV || 'production',
    ALLOWED_HOSTS: extraEnv.ALLOWED_HOSTS || 'localhost,127.0.0.1',
  };
  const entry = path.join(cwd, 'server', 'index.js');
  const child = spawn(process.execPath, [entry], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stdout.on('data', (c) => { stderr += c.toString(); });
  child.stderr.on('data', (c) => { stderr += c.toString(); });
  let result;
  try {
    await waitForServer(port, host, STARTUP_TIMEOUT_MS);
    result = await fn({ port, host, baseUrl: `http://${host}:${port}` });
  } finally {
    if (!child.killed) {
      try { child.kill('SIGTERM'); } catch (_) {}
      await sleep(200);
      if (!child.killed) {
        try { child.kill('SIGKILL'); } catch (_) {}
      }
    }
  }
  return result;
}

module.exports = { withFreshServer };
