// tests/specs/ai-baseurl-https-only.cjs
// 周期 1 P0-3: validateBaseUrl dev/prod 一律 https-only；
// Ollama 例外需 AI_ALLOW_HTTP=1。

'use strict';

const path = require('path');

const aiPath = path.resolve(__dirname, '..', '..', 'server', 'services', 'ai.js');

function loadWithAllowHttp(value) {
  if (value === null) delete process.env.AI_ALLOW_HTTP;
  else process.env.AI_ALLOW_HTTP = value;
  delete require.cache[require.resolve(aiPath)];
  return require(aiPath);
}

const cases = [
  ['OpenAI https',                   'https://api.openai.com/v1',  null, true],
  ['OpenAI http 拒绝',               'http://api.openai.com/v1',   null, false],
  ['Anthropic https',                'https://api.anthropic.com/v1', null, true],
  ['非白名单 https 拒绝',             'https://evil.example.com/v1', null, false],
  ['Ollama localhost http 默认拒绝',   'http://localhost:11434/v1',  null, false],
  ['Ollama localhost http 显式 ALLOW', 'http://localhost:11434/v1',  '1', true],
  ['非 ollama 内网 http 拒绝',         'http://10.0.0.1/v1',         '1', false],
  ['空字符串拒绝',                     '',                            null, false],
  ['非法 URL 拒绝',                    'not a url',                  null, false],
];

let pass = 0;
let fail = 0;
for (const [name, url, envFlag, expectedOk] of cases) {
  const mod = loadWithAllowHttp(envFlag);
  const fn = (mod._internal && mod._internal.validateBaseUrl) || mod.validateBaseUrl;
  if (typeof fn !== 'function') {
    process.stdout.write(`  [SKIP] ${name} — validateBaseUrl 未暴露\n`);
    continue;
  }
  let ok = true;
  let errMsg = null;
  try {
    fn(url);
  } catch (e) {
    ok = false;
    errMsg = e && e.message;
  }
  const matches = ok === expectedOk;
  process.stdout.write(`  [${matches ? 'PASS' : 'FAIL'}] ${name} — ok=${ok} expected=${expectedOk}${errMsg ? ' err=' + errMsg : ''}\n`);
  if (matches) pass += 1; else fail += 1;
}

process.stdout.write(`--- spec ai-baseurl-https-only: pass=${pass} fail=${fail} ---\n`);
if (fail > 0) process.exit(1);
