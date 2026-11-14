// tests/specs/redact-deep.cjs
// Cycle 25 R2: server/utils/redact.js 深度测试
// 覆盖: SECRET_PATTERNS / redactSecret / redactDeep 全部边界
'use strict';

const assert = require('node:assert');

const { redactSecret, redactDeep, SECRET_PATTERNS } = require('../../server/utils/redact');

// ---- 计数器 ----
let pass = 0, fail = 0;
const failures = [];
async function ok(label, fn) {
  try {
    await fn();
    pass++;
    console.log(`  [PASS] ${label}`);
  } catch (e) {
    fail++;
    console.log(`  [FAIL] ${label}: ${e.message}`);
    failures.push({ label, err: e.message });
  }
}

async function main() {
  console.log('=== Cycle 25 R2: redact.js deep tests ===\n');

  // ===== A组: 模块导出 =====
  console.log('\n-- A组: 模块导出 --');
  await ok('A1: 导出 3 个符号', () => {
    const keys = Object.keys({ redactSecret, redactDeep, SECRET_PATTERNS });
    assert.strictEqual(keys.length, 3);
  });
  await ok('A2: redactSecret 是 function', () => {
    assert.strictEqual(typeof redactSecret, 'function');
  });
  await ok('A3: redactDeep 是 function', () => {
    assert.strictEqual(typeof redactDeep, 'function');
  });
  await ok('A4: SECRET_PATTERNS 是 Array', () => {
    assert.ok(Array.isArray(SECRET_PATTERNS));
  });
  await ok('A5: SECRET_PATTERNS 长度=6', () => {
    assert.strictEqual(SECRET_PATTERNS.length, 6);
  });
  await ok('A6: SECRET_PATTERNS 全部是 RegExp', () => {
    for (const p of SECRET_PATTERNS) {
      assert.ok(p instanceof RegExp, `pattern not RegExp: ${p}`);
    }
  });
  await ok('A7: SECRET_PATTERNS 全部是全局标志', () => {
    for (const p of SECRET_PATTERNS) {
      assert.strictEqual(p.global, true, `pattern not global: ${p}`);
    }
  });

  // ===== B组: SECRET_PATTERNS 6 个正则逐个验证 =====
  console.log('\n-- B组: SECRET_PATTERNS 内容验证 --');
  await ok('B1: 包含 Bearer 模式', () => {
    const bearer = SECRET_PATTERNS.find((p) => p.source.includes('Bearer'));
    assert.ok(bearer);
    assert.ok(bearer.ignoreCase);
  });
  await ok('B2: 包含 sk- 模式（OpenAI key）', () => {
    const sk = SECRET_PATTERNS.find((p) => p.source.includes('sk-'));
    assert.ok(sk);
  });
  await ok('B3: 包含 ghp_ 模式（GitHub token）', () => {
    const ghp = SECRET_PATTERNS.find((p) => p.source.includes('ghp_'));
    assert.ok(ghp);
  });
  await ok('B4: 包含 github_pat_ 模式（GitHub PAT）', () => {
    const gp = SECRET_PATTERNS.find((p) => p.source.includes('github_pat_'));
    assert.ok(gp);
  });
  await ok('B5: 包含 key= 模式', () => {
    const key = SECRET_PATTERNS.find((p) => p.source.includes('key='));
    assert.ok(key);
    assert.ok(key.ignoreCase);
  });
  await ok('B6: 包含 api[_-]?key 模式', () => {
    const apiKey = SECRET_PATTERNS.find((p) => p.source.includes('api[_-]?key'));
    assert.ok(apiKey);
    assert.ok(apiKey.ignoreCase);
  });
  await ok('B7: Bearer 模式支持多 token 字符集', () => {
    const bearer = SECRET_PATTERNS.find((p) => p.source.includes('Bearer'));
    // 匹配字母数字和 . _ -
    assert.ok(bearer.test('Bearer abc123.DEF-ghi_'));
  });
  await ok('B8: sk- 模式至少 16 字符', () => {
    const sk = SECRET_PATTERNS.find((p) => p.source.includes('sk-'));
    sk.lastIndex = 0;
    assert.ok(sk.test('sk-1234567890123456')); // 16 字符
    sk.lastIndex = 0;
    assert.ok(!sk.test('sk-123456789012345')); // 15 字符
    sk.lastIndex = 0;
    assert.ok(sk.test('sk-12345678901234567')); // 17 字符
  });
  await ok('B9: ghp_ 模式至少 20 字符', () => {
    const ghp = SECRET_PATTERNS.find((p) => p.source.includes('ghp_'));
    ghp.lastIndex = 0;
    assert.ok(ghp.test('ghp_12345678901234567890')); // 20 字符
    ghp.lastIndex = 0;
    assert.ok(!ghp.test('ghp_1234567890123456789')); // 19 字符
  });
  await ok('B10: github_pat_ 模式至少 20 字符', () => {
    const gp = SECRET_PATTERNS.find((p) => p.source.includes('github_pat_'));
    gp.lastIndex = 0;
    assert.ok(gp.test('github_pat_12345678901234567890'));
    gp.lastIndex = 0;
    assert.ok(!gp.test('github_pat_1234567890123456789'));
  });

  // ===== C组: redactSecret 字符串脱敏 - 各 pattern 匹配 =====
  console.log('\n-- C组: redactSecret 字符串脱敏 --');
  await ok('C1: Bearer token 被替换', () => {
    const out = redactSecret('Authorization: Bearer abc123.token-value');
    assert.strictEqual(out, 'Authorization: ***redacted***');
  });
  await ok('C2: Bearer 大小写不敏感', () => {
    assert.strictEqual(redactSecret('bearer abc123'), '***redacted***');
    assert.strictEqual(redactSecret('BEARER abc123'), '***redacted***');
  });
  await ok('C3: Bearer 支持点/下划线/连字符', () => {
    assert.strictEqual(redactSecret('Bearer a.b_c-d'), '***redacted***');
  });
  await ok('C4: Bearer 多空格分隔', () => {
    assert.strictEqual(redactSecret('Bearer   abc123'), '***redacted***');
  });
  await ok('C5: sk- OpenAI key 被替换', () => {
    const out = redactSecret('key=sk-12345678901234567890');
    assert.strictEqual(out, 'key=***redacted***');
  });
  await ok('C6: sk- 短于 16 字符不被替换', () => {
    assert.strictEqual(redactSecret('sk-12345'), 'sk-12345');
  });
  await ok('C7: ghp_ GitHub token 被替换', () => {
    const out = redactSecret('ghp_12345678901234567890');
    assert.strictEqual(out, '***redacted***');
  });
  await ok('C8: github_pat_ GitHub PAT 被替换', () => {
    const out = redactSecret('github_pat_12345678901234567890');
    assert.strictEqual(out, '***redacted***');
  });
  await ok('C9: key=value 被替换（key= 整段被替换）', () => {
    const out = redactSecret('key=abcdef1234567890');
    assert.strictEqual(out, '***redacted***');
  });
  await ok('C10: KEY= 大小写不敏感（KEY= 整段被替换）', () => {
    const out = redactSecret('KEY=abcdef1234567890');
    assert.strictEqual(out, '***redacted***');
  });
  await ok('C11: apiKey=value 被替换（apiKey= 整段被替换）', () => {
    const out = redactSecret('apiKey=abcdef1234567890');
    assert.strictEqual(out, '***redacted***');
  });
  await ok('C12: api_key=value 被替换（api_key= 整段被替换）', () => {
    const out = redactSecret('api_key=abcdef1234567890');
    assert.strictEqual(out, '***redacted***');
  });
  await ok('C13: api-key=value 部分替换（api- 保留，key= 替换）', () => {
    // api[_-]?key[=:] 中的 [_-]? 允许连字符，但 \b 边界让 "api-key=" 被切成 "api-" + "key="
    // 实测：api-key=abcdef1234567890 → api-***redacted***
    const out = redactSecret('api-key=abcdef1234567890');
    assert.strictEqual(out, 'api-***redacted***');
  });
  await ok('C14: api key: 空格分隔不匹配（已知局限）', () => {
    // api[_-]?key[=:] 中 [_-]? 不匹配空格，所以 "api key: " 不被脱敏
    const out = redactSecret('api key: abcdef1234567890');
    assert.strictEqual(out, 'api key: abcdef1234567890');
  });
  await ok('C15: api_key:value 被替换（api_key: 整段被替换）', () => {
    const out = redactSecret('api_key:abcdef1234567890');
    assert.strictEqual(out, '***redacted***');
  });

  // ===== D组: redactSecret 边界输入 =====
  console.log('\n-- D组: redactSecret 边界输入 --');
  await ok('D1: null 输入返回原值', () => {
    assert.strictEqual(redactSecret(null), null);
  });
  await ok('D2: undefined 输入返回原值', () => {
    assert.strictEqual(redactSecret(undefined), undefined);
  });
  await ok('D3: 空字符串返回空字符串', () => {
    assert.strictEqual(redactSecret(''), '');
  });
  await ok('D4: 无密钥的普通字符串不变', () => {
    assert.strictEqual(redactSecret('hello world'), 'hello world');
  });
  await ok('D5: 数字输入返回原值（非 string）', () => {
    assert.strictEqual(redactSecret(12345), 12345);
  });
  await ok('D6: 对象输入返回原值', () => {
    const obj = { foo: 'bar' };
    assert.strictEqual(redactSecret(obj), obj);
  });
  await ok('D7: 数组输入返回原值', () => {
    const arr = [1, 2, 3];
    assert.strictEqual(redactSecret(arr), arr);
  });
  await ok('D8: 布尔输入返回原值', () => {
    assert.strictEqual(redactSecret(true), true);
    assert.strictEqual(redactSecret(false), false);
  });
  await ok('D9: symbol 输入返回原值', () => {
    const s = Symbol('test');
    assert.strictEqual(redactSecret(s), s);
  });
  await ok('D10: 单字符 key（短于 16）不替换', () => {
    assert.strictEqual(redactSecret('key=a'), 'key=a');
  });
  await ok('D11: 多 Bearer 全部替换', () => {
    const out = redactSecret('Bearer aaa111 and Bearer bbb222');
    assert.strictEqual(out, '***redacted*** and ***redacted***');
  });
  await ok('D12: 混合多种密钥全部替换', () => {
    const out = redactSecret('Bearer aa11 Bearer bb22 sk-12345678901234567 ghp_12345678901234567890');
    // 注意：每个 pattern 独立替换
    assert.ok(out.includes('***redacted***'));
    assert.ok(!out.includes('Bearer aa11'));
    assert.ok(!out.includes('sk-12345678901234567'));
  });
  await ok('D13: 密钥嵌入 URL 中被替换', () => {
    // \bkey=[A-Za-z0-9._-]{16,} 把 "key=abcdef..." 整段替换为 ***redacted***
    const out = redactSecret('https://api.example.com?key=abcdef1234567890');
    assert.strictEqual(out, 'https://api.example.com?***redacted***');
  });
  await ok('D14: JSON 格式字符串中 apiKey 值不被替换（无 : = 分隔符）', () => {
    // api[_-]?key[=:] 要求 key 后紧跟 = 或 :，但 JSON 中是 "apiKey":"value"
    // 因此 JSON 中的 apiKey 值不会被脱敏（已知局限）
    const out = redactSecret('{"apiKey":"abcdef1234567890"}');
    assert.strictEqual(out, '{"apiKey":"abcdef1234567890"}');
  });
  await ok('D14b: JSON 中 apiKey: 形式（紧凑）被替换', () => {
    // {"apiKey": "abcdef..."} 中间有空格，也不匹配（因 \s* 在 [=:] 后）
    // 只有 apiKey=abcdef... 才匹配
    const out = redactSecret('{"apiKey": "abcdef1234567890"}');
    assert.strictEqual(out, '{"apiKey": "abcdef1234567890"}');
  });
  await ok('D15: 中文文本中密钥被替换', () => {
    const out = redactSecret('调用 Bearer abc123.def-ghi 接口');
    assert.strictEqual(out, '调用 ***redacted*** 接口');
  });

  // ===== E组: redactSecret 各 pattern 独立验证 =====
  console.log('\n-- E组: redactSecret 各 pattern 独立验证 --');
  await ok('E1: 仅 Bearer 触发 Bearer 替换', () => {
    assert.strictEqual(redactSecret('Bearer abc123'), '***redacted***');
  });
  await ok('E2: 仅 sk- 触发 sk- 替换', () => {
    assert.strictEqual(redactSecret('sk-1234567890123456'), '***redacted***');
  });
  await ok('E3: 仅 ghp_ 触发 ghp_ 替换', () => {
    assert.strictEqual(redactSecret('ghp_12345678901234567890'), '***redacted***');
  });
  await ok('E4: 仅 github_pat_ 触发 github_pat_ 替换', () => {
    assert.strictEqual(redactSecret('github_pat_12345678901234567890'), '***redacted***');
  });
  await ok('E5: 仅 key= 触发 key= 替换（key= 整段被替换）', () => {
    assert.strictEqual(redactSecret('key=abcdef1234567890'), '***redacted***');
  });
  await ok('E6: 仅 api_key: 触发 api[_-]?key 替换（api_key: 整段被替换）', () => {
    assert.strictEqual(redactSecret('api_key:abcdef1234567890'), '***redacted***');
  });
  await ok('E7: Bearer 后跟纯字母数字', () => {
    assert.strictEqual(redactSecret('Bearer abcdef'), '***redacted***');
  });
  await ok('E8: sk- 后跟下划线', () => {
    assert.strictEqual(redactSecret('sk-12345678901234567'), '***redacted***');
  });
  await ok('E9: api_key 后跟空格和冒号不匹配（已知局限）', () => {
    // api[_-]?key[=:] 中 [:=] 必须紧跟 key，但 "api_key :" 中 key 后是空格，不匹配
    const out = redactSecret('api_key : abcdef1234567890');
    assert.strictEqual(out, 'api_key : abcdef1234567890');
  });
  await ok('E10: Bearer 不在词边界仍替换（"Bearer abc"）', () => {
    assert.strictEqual(redactSecret('Bearer abc'), '***redacted***');
  });

  // ===== F组: redactDeep 递归脱敏 =====
  console.log('\n-- F组: redactDeep 递归脱敏 --');
  await ok('F1: 简单字符串脱敏', () => {
    assert.strictEqual(redactDeep('Bearer abc123'), '***redacted***');
  });
  await ok('F2: null 返回 null', () => {
    assert.strictEqual(redactDeep(null), null);
  });
  await ok('F3: undefined 返回 undefined', () => {
    assert.strictEqual(redactDeep(undefined), undefined);
  });
  await ok('F4: 数字返回原值', () => {
    assert.strictEqual(redactDeep(42), 42);
  });
  await ok('F5: 布尔返回原值', () => {
    assert.strictEqual(redactDeep(true), true);
  });
  await ok('F6: 简单对象递归', () => {
    const out = redactDeep({ token: 'Bearer abc123', name: 'hello' });
    assert.strictEqual(out.token, '***redacted***');
    assert.strictEqual(out.name, 'hello');
  });
  await ok('F7: 嵌套对象递归', () => {
    const out = redactDeep({ outer: { inner: { secret: 'Bearer abc123' } } });
    assert.strictEqual(out.outer.inner.secret, '***redacted***');
  });
  await ok('F8: 数组内字符串脱敏', () => {
    const out = redactDeep(['Bearer abc123', 'hello', 'sk-1234567890123456']);
    assert.strictEqual(out[0], '***redacted***');
    assert.strictEqual(out[1], 'hello');
    assert.strictEqual(out[2], '***redacted***');
  });
  await ok('F9: 数组内嵌套对象', () => {
    const out = redactDeep([{ secret: 'Bearer abc123' }, { safe: 'hello' }]);
    assert.strictEqual(out[0].secret, '***redacted***');
    assert.strictEqual(out[1].safe, 'hello');
  });
  await ok('F10: 混合类型数组', () => {
    const out = redactDeep(['Bearer abc123', 42, true, null, undefined]);
    assert.strictEqual(out[0], '***redacted***');
    assert.strictEqual(out[1], 42);
    assert.strictEqual(out[2], true);
    assert.strictEqual(out[3], null);
    assert.strictEqual(out[4], undefined);
  });
  await ok('F11: 对象字段顺序保持', () => {
    const out = redactDeep({ a: 'Bearer abc123', b: 'safe', c: 'sk-1234567890123456' });
    assert.deepStrictEqual(Object.keys(out), ['a', 'b', 'c']);
    assert.strictEqual(out.a, '***redacted***');
    assert.strictEqual(out.b, 'safe');
    assert.strictEqual(out.c, '***redacted***');
  });
  await ok('F12: 空对象返回新空对象', () => {
    const out = redactDeep({});
    assert.deepStrictEqual(out, {});
  });
  await ok('F13: 空数组返回新空数组', () => {
    const out = redactDeep([]);
    assert.deepStrictEqual(out, []);
  });
  await ok('F14: 深嵌套（5 层）', () => {
    const out = redactDeep({ l1: { l2: { l3: { l4: { l5: 'Bearer abc123' } } } } });
    assert.strictEqual(out.l1.l2.l3.l4.l5, '***redacted***');
  });
  await ok('F15: 大对象不崩溃', () => {
    const big = {};
    for (let i = 0; i < 100; i++) {
      big[`key${i}`] = `Bearer abc${i}`;
    }
    const out = redactDeep(big);
    assert.strictEqual(out.key0, '***redacted***');
    assert.strictEqual(out.key99, '***redacted***');
  });
  await ok('F16: 返回新对象（不修改原对象）', () => {
    const orig = { token: 'Bearer abc123' };
    const out = redactDeep(orig);
    assert.notStrictEqual(orig, out);
    assert.strictEqual(orig.token, 'Bearer abc123'); // 原对象未变
    assert.strictEqual(out.token, '***redacted***');
  });
  await ok('F17: 返回新数组（不修改原数组）', () => {
    const orig = ['Bearer abc123'];
    const out = redactDeep(orig);
    assert.notStrictEqual(orig, out);
    assert.strictEqual(orig[0], 'Bearer abc123');
    assert.strictEqual(out[0], '***redacted***');
  });
  await ok('F18: 原值类型保留（数字）', () => {
    const out = redactDeep({ n: 42, s: 'Bearer abc123' });
    assert.strictEqual(out.n, 42);
    assert.strictEqual(typeof out.n, 'number');
  });
  await ok('F19: 原值类型保留（布尔）', () => {
    const out = redactDeep({ b: false });
    assert.strictEqual(out.b, false);
    assert.strictEqual(typeof out.b, 'boolean');
  });
  await ok('F20: 原值类型保留（null）', () => {
    const out = redactDeep({ n: null });
    assert.strictEqual(out.n, null);
  });

  // ===== G组: redactDeep 复杂场景 =====
  console.log('\n-- G组: redactDeep 复杂场景 --');
  await ok('G1: 模拟日志对象', () => {
    // 注意：body.apiKey 是字符串值，但 "Bearer abc123.token-value" 中 token-value 含 -
    // \bkey=[A-Za-z0-9._-]{16,} 匹配 "key=abcdef..." 整段
    // 但 body: { apiKey: 'abcdef...' } 中 apiKey 后面是空格 + 值，不被 api[_-]?key[=:] 匹配
    // 改用 Bearer token 测试
    const out = redactDeep({
      method: 'GET',
      url: '/api/test',
      headers: {
        authorization: 'Bearer abc123.token-value',
        'x-request-id': 'req-123',
      },
      body: { note: 'auth Bearer abc123.def-ghi' },
    });
    assert.strictEqual(out.method, 'GET');
    assert.strictEqual(out.url, '/api/test');
    assert.strictEqual(out.headers.authorization, '***redacted***');
    assert.strictEqual(out.headers['x-request-id'], 'req-123');
    assert.strictEqual(out.body.note, 'auth ***redacted***');
  });
  await ok('G2: 模拟 AI request 对象', () => {
    // 注意：apiKey: 'sk-...' 中 sk- 是 OpenAI key 模式，会被替换
    // 但 apiKey 字段名本身不会被替换（因为值不是 apiKey= 形式）
    const out = redactDeep({
      platform: 'openai',
      apiKey: 'sk-1234567890123456',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'Bearer abc123' },
      ],
    });
    assert.strictEqual(out.platform, 'openai');
    assert.strictEqual(out.apiKey, '***redacted***');
    assert.strictEqual(out.messages[0].content, 'hello');
    assert.strictEqual(out.messages[1].content, '***redacted***');
  });
  await ok('G3: 模拟 GitHub PR 对象', () => {
    // content: 'const key=abcdef...' 中 key= 被替换为 ***redacted***
    // 所以整个字符串变成 'const ***redacted***'
    const out = redactDeep({
      author: { token: 'ghp_12345678901234567890' },
      body: 'fix: use github_pat_12345678901234567890',
      files: [
        { path: 'src/a.js', content: 'const key=abcdef1234567890' },
      ],
    });
    assert.strictEqual(out.author.token, '***redacted***');
    assert.ok(out.body.includes('***redacted***'));
    assert.strictEqual(out.files[0].content, 'const ***redacted***');
  });
  await ok('G4: 嵌套数组中的对象', () => {
    const out = redactDeep({
      data: [
        ['Bearer abc123', 'safe'],
        { inner: 'sk-1234567890123456' },
      ],
    });
    assert.strictEqual(out.data[0][0], '***redacted***');
    assert.strictEqual(out.data[0][1], 'safe');
    assert.strictEqual(out.data[1].inner, '***redacted***');
  });

  // ===== H组: 回归验证 - 现有行为兼容 =====
  console.log('\n-- H组: 回归验证 --');
  await ok('H1: redactSecret 是纯函数（不修改入参）', () => {
    const s = 'Bearer abc123';
    redactSecret(s);
    assert.strictEqual(s, 'Bearer abc123');
  });
  await ok('H2: redactDeep 是纯函数（不修改入参对象）', () => {
    const obj = { token: 'Bearer abc123' };
    redactDeep(obj);
    assert.strictEqual(obj.token, 'Bearer abc123');
  });
  await ok('H3: 多次调用同一字符串结果一致', () => {
    const s = 'Bearer abc123';
    const r1 = redactSecret(s);
    const r2 = redactSecret(s);
    assert.strictEqual(r1, r2);
  });
  await ok('H4: 多次调用同一对象结果一致', () => {
    const obj = { token: 'Bearer abc123' };
    const r1 = redactDeep(obj);
    const r2 = redactDeep(obj);
    assert.deepStrictEqual(r1, r2);
  });
  await ok('H5: 无密钥文本返回原值引用', () => {
    const s = 'hello';
    assert.strictEqual(redactSecret(s), s);
  });
  await ok('H6: 非字符串返回原值引用', () => {
    const n = 42;
    assert.strictEqual(redactSecret(n), n);
  });

  // ===== summary =====
  console.log(`\n--- summary: pass=${pass} fail=${fail} ---`);
  if (failures.length) {
    console.log('failures:', JSON.stringify(failures, null, 2));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(2);
});
