// tests/specs/requestid-trace-link.cjs
// 周期 11 P2-3: memory middleware ALS requestId 全链路 trace

'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');

let pass = 0;
let fail = 0;

function assert(cond, name, detail) {
  const tag = cond ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}\n`);
  if (cond) pass += 1; else fail += 1;
}

(async () => {
  const root = path.resolve(__dirname, '..', '..');
  const loggerPath = path.join(root, 'server/middleware/logger.js');
  const memoryPath = path.join(root, 'server/agent/memory.js');
  process.stdout.write('\n=== requestid-trace-link ===\n');

  // 1) logger 完整支持 requestId + traceId
  assert(fs.existsSync(loggerPath), 'logger.js exists');
  const loggerCode = fs.readFileSync(loggerPath, 'utf8');
  assert(/parseTraceparent/.test(loggerCode), 'parseTraceparent exists');
  assert(/generateTraceparent/.test(loggerCode), 'generateTraceparent exists');
  assert(/x-request-id/.test(loggerCode), 'x-request-id header');
  assert(/X-Request-Id/.test(loggerCode), 'X-Request-Id response');
  assert(/traceparent/.test(loggerCode), 'traceparent header');
  assert(/traceId/.test(loggerCode), 'traceId in log');

  // 2) memory middleware 也读 x-request-id
  assert(fs.existsSync(memoryPath), 'memory.js exists');
  const memoryCode = fs.readFileSync(memoryPath, 'utf8');
  assert(/x-request-id/.test(memoryCode), 'memory middleware reads x-request-id');
  assert(/setHeader\(['"]x-request-id['"]/.test(memoryCode), 'memory middleware writes x-request-id');

  // 3) 两者提取逻辑一致（均 headers['x-request-id'] || generated）
  const loggerPattern = /req\.headers\['x-request-id'\]\s*\|\|\s*randomUUID/;
  assert(loggerPattern.test(loggerCode), 'logger falls back to randomUUID');
  const memoryPattern = /req\.headers\['x-request-id'\]/;
  assert(memoryPattern.test(memoryCode), 'memory reads header');

  // 4) logger middleware 写到响应头
  assert(/res\.setHeader\(['"]X-Request-Id['"]/.test(loggerCode), 'logger writes X-Request-Id response');
  assert(/res\.setHeader\(['"]x-request-id['"]/.test(memoryCode), 'memory writes x-request-id response');

  // 5) parseTraceparent W3C 格式校验
  // 用子进程隔离（避免污染本进程 ALS）
  const script = `
    const { parseTraceparent, generateTraceparent } = require(${JSON.stringify(loggerPath)});
    const cases = [
      { input: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', expect: true },
      { input: '00-00000000000000000000000000000000-00f067aa0ba902b7-01', expect: false },
      { input: '00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01', expect: false },
      { input: '01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', expect: false },
      { input: 'invalid', expect: null },
      { input: null, expect: null },
      { input: undefined, expect: null },
    ];
    let pass = 0, fail = 0;
    for (const c of cases) {
      const got = parseTraceparent(c.input);
      let ok;
      if (c.expect === null) {
        ok = got === null;
      } else if (c.expect === true) {
        ok = got !== null && got.traceId.length === 32;
      } else {
        // expect === false: invalid input should be rejected (got === null)
        ok = got === null;
      }
      if (ok) pass++; else fail++;
    }
    const gen = generateTraceparent();
    const genParsed = parseTraceparent(gen);
    if (genParsed && genParsed.traceId.length === 32) pass++; else fail++;
    const genWithParent = generateTraceparent({ traceId: 'a'.repeat(32) });
    const genWPParsed = parseTraceparent(genWithParent);
    if (genWPParsed && genWPParsed.traceId === 'a'.repeat(32)) pass++; else fail++;
    console.log(JSON.stringify({ pass, fail, sample: genParsed }));
  `;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  if (r.status !== 0) {
    assert(false, 'subprocess exit', `code=${r.status} stderr=${r.stderr}`);
  } else {
    const out = JSON.parse(r.stdout.trim());
    assert(out.fail === 0, `parseTraceparent cases (${out.pass} pass, ${out.fail} fail)`);
    assert(out.sample && out.sample.traceId.length === 32, 'generated traceId 32 hex');
  }

  // 6) logger ALS 跨同步调用保留 requestId
  const scriptAls = `
    const { logger, runWithRequestContext, getRequestId } = require(${JSON.stringify(loggerPath)});
    let capturedId;
    runWithRequestContext({ reqId: 'test-req-abc-123', route: '/test' }, () => {
      capturedId = getRequestId();
    });
    console.log(JSON.stringify({ capturedId }));
  `;
  const rAls = spawnSync(process.execPath, ['-e', scriptAls], { encoding: 'utf8' });
  if (rAls.status !== 0) {
    assert(false, 'ALS subprocess exit', rAls.stderr);
  } else {
    const out = JSON.parse(rAls.stdout.trim());
    assert(out.capturedId === 'test-req-abc-123', 'ALS preserves reqId', `got=${out.capturedId}`);
  }

  // 7) memoryContextMiddleware 生成 id 与 logger 一致（都用 headers 或 randomUUID）
  assert(/'req_' \+ Date\.now/.test(memoryCode) || /randomUUID/.test(memoryCode) ||
    /req\.headers\['x-request-id'\]/.test(memoryCode), 'memory uses header or generated id');

  // 8) 跨 ALS 隔离（不同请求不共享）
  const scriptIso = `
    const { runWithRequestContext, getRequestId } = require(${JSON.stringify(loggerPath)});
    let a, b;
    runWithRequestContext({ reqId: 'a' }, () => {
      a = getRequestId();
      runWithRequestContext({ reqId: 'b' }, () => {
        b = getRequestId();
      });
      const afterB = getRequestId();
      console.log(JSON.stringify({ a, b, afterB }));
    });
  `;
  const rIso = spawnSync(process.execPath, ['-e', scriptIso], { encoding: 'utf8' });
  if (rIso.status !== 0) {
    assert(false, 'isolation subprocess exit', rIso.stderr);
  } else {
    const out = JSON.parse(rIso.stdout.trim());
    assert(out.a === 'a' && out.b === 'b' && out.afterB === 'a', 'ALS isolation works');
  }

  // 9) traceparent 头透传（端到端：客户端发 traceparent → 服务端解析 → 日志含 traceId）
  const scriptE2E = `
    const { logger, httpLoggerMiddleware, parseTraceparent, generateTraceparent } = require(${JSON.stringify(loggerPath)});
    const express = require('express');
    const app = express();
    app.use(httpLoggerMiddleware);
    app.get('/test', (req, res) => {
      const trace = parseTraceparent(req.headers.traceparent);
      res.json({ ok: true, reqId: req.headers['x-request-id'], traceId: trace ? trace.traceId : null });
    });
    const server = app.listen(0, () => {
      const port = server.address().port;
      const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      http.get({ hostname: '127.0.0.1', port, path: '/test', headers: { traceparent: tp, 'x-request-id': 'client-req-001' } }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          const j = JSON.parse(body);
          console.log(JSON.stringify({ reqId: j.reqId, traceId: j.traceId, responseReqId: res.headers['x-request-id'] }));
          server.close();
        });
      });
    });
  `;
  const rE2E = spawnSync(process.execPath, ['-e', scriptE2E], { encoding: 'utf8', timeout: 15000 });
  if (rE2E.status !== 0) {
    assert(false, 'e2e subprocess exit', rE2E.stderr || rE2E.stdout);
  } else {
    // 多行输出（express 中间件日志在 stdout）；只取最后一行 JSON
    const lines = rE2E.stdout.trim().split('\n').filter((l) => l.startsWith('{'));
    const out = JSON.parse(lines[lines.length - 1] || '{}');
    assert(out.reqId === 'client-req-001', 'client x-request-id preserved', `got=${out.reqId}`);
    assert(out.traceId === '4bf92f3577b34da6a3ce929d0e0e4736', 'traceparent traceId extracted');
    assert(out.responseReqId === 'client-req-001', 'response X-Request-Id echoes client id');
  }

  process.stdout.write(`\n--- summary: pass=${pass} fail=${fail} ---\n`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n`);
  process.exit(2);
});
