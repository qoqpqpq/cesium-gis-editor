// tests/specs/ai-prompts.cjs
// Cycle 22 R2: ai-prompts 系统提示词管理测试
// 目标：≥ 25 PASS
//
// 背景：server/services/ai-prompts.js 64 行，此前完全未测。
//       提供 getPrompt(scope) 与 listScopes() 两个 API，
//       被 /api/ai/system-prompts/:scope 路由调用。
//
// 覆盖点：
//   - 导出 API 形状
//   - getPrompt 已知 scope 返回对应内容
//   - getPrompt 未知 scope 回退到 chat 默认
//   - getPrompt 边界（null/undefined/空字符串/数字/对象）
//   - listScopes 返回 scope 名称数组
//   - PROMPTS 内容质量断言（关键字段、结构完整）

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const { getPrompt, listScopes } = require(path.join(__dirname, '../../server/services/ai-prompts'));

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

(async () => {
  console.log('=== ai-prompts ===');

  // ============ Group A: 模块导出 ============
  await ok('A1: 导出 getPrompt', () => {
    assert.strictEqual(typeof getPrompt, 'function');
  });
  await ok('A2: 导出 listScopes', () => {
    assert.strictEqual(typeof listScopes, 'function');
  });
  await ok('A3: 恰好导出 2 个 API', () => {
    const mod = require(path.join(__dirname, '../../server/services/ai-prompts'));
    const keys = Object.keys(mod).sort();
    assert.deepStrictEqual(keys, ['getPrompt', 'listScopes']);
  });

  // ============ Group B: listScopes ============
  await ok('B1: listScopes 返回数组', () => {
    assert.ok(Array.isArray(listScopes()));
  });
  await ok('B2: 包含 gis scope', () => {
    assert.ok(listScopes().includes('gis'));
  });
  await ok('B3: 包含 chat scope', () => {
    assert.ok(listScopes().includes('chat'));
  });
  await ok('B4: 恰好 2 个 scope', () => {
    assert.strictEqual(listScopes().length, 2);
  });
  await ok('B5: 顺序 gis 在 chat 前', () => {
    const scopes = listScopes();
    assert.ok(scopes.indexOf('gis') < scopes.indexOf('chat'));
  });
  await ok('B6: 每次调用返回新数组（非引用）', () => {
    const a = listScopes();
    const b = listScopes();
    assert.notStrictEqual(a, b);
  });
  await ok('B7: 返回值只读语义——修改返回值不改变内部', () => {
    const a = listScopes();
    a.push('fake');
    assert.strictEqual(listScopes().length, 2);
  });

  // ============ Group C: getPrompt - 已知 scope ============
  await ok('C1: getPrompt("gis") 返回 string', () => {
    assert.strictEqual(typeof getPrompt('gis'), 'string');
  });
  await ok('C2: getPrompt("chat") 返回 string', () => {
    assert.strictEqual(typeof getPrompt('chat'), 'string');
  });
  await ok('C3: gis prompt 非空', () => {
    assert.ok(getPrompt('gis').length > 100);
  });
  await ok('C4: chat prompt 非空', () => {
    assert.ok(getPrompt('chat').length > 10);
  });
  await ok('C5: gis prompt 包含 GIS 关键词', () => {
    const p = getPrompt('gis');
    assert.ok(p.includes('GIS'));
  });
  await ok('C6: gis prompt 包含 Cesium 关键词', () => {
    const p = getPrompt('gis');
    assert.ok(p.includes('Cesium'));
  });
  await ok('C7: gis prompt 包含 viewer.entities 说明', () => {
    const p = getPrompt('gis');
    assert.ok(p.includes('entities'));
  });
  await ok('C8: gis prompt 包含 Sandcastle 风格', () => {
    assert.ok(getPrompt('gis').includes('Sandcastle'));
  });
  await ok('C9: gis prompt 包含代码块硬性规则 ```js', () => {
    assert.ok(getPrompt('gis').includes('```js'));
  });
  await ok('C10: gis prompt 禁止 HTML 模板声明', () => {
    assert.ok(getPrompt('gis').includes('HTML'));
    assert.ok(getPrompt('gis').includes('禁止'));
  });

  // ============ Group D: getPrompt - 未知 scope 回退 ============
  await ok('D1: 未知 scope 回退到 chat prompt', () => {
    assert.strictEqual(getPrompt('unknown'), getPrompt('chat'));
  });
  await ok('D2: 空字符串回退', () => {
    assert.strictEqual(getPrompt(''), getPrompt('chat'));
  });
  await ok('D3: null 回退', () => {
    assert.strictEqual(getPrompt(null), getPrompt('chat'));
  });
  await ok('D4: undefined 回退', () => {
    assert.strictEqual(getPrompt(undefined), getPrompt('chat'));
  });
  await ok('D5: 数字回退', () => {
    assert.strictEqual(getPrompt(123), getPrompt('chat'));
  });
  await ok('D6: 对象回退', () => {
    assert.strictEqual(getPrompt({}), getPrompt('chat'));
  });
  await ok('D7: 数组回退', () => {
    assert.strictEqual(getPrompt([]), getPrompt('chat'));
  });
  await ok('D8: 大小写敏感（GIS ≠ gis）回退', () => {
    // "GIS" 不在 PROMPTS 中，应回退
    assert.strictEqual(getPrompt('GIS'), getPrompt('chat'));
  });

  // ============ Group E: 内容质量断言 ============
  await ok('E1: chat prompt 包含"AI 助手"', () => {
    assert.ok(getPrompt('chat').includes('AI'));
  });
  await ok('E2: gis prompt 包含 tool 标签说明', () => {
    assert.ok(getPrompt('gis').includes('<tool>'));
    assert.ok(getPrompt('gis').includes('web_search'));
  });
  await ok('E3: gis prompt 包含中英文混合措辞说明', () => {
    const p = getPrompt('gis');
    assert.ok(p.includes('中文'));
    assert.ok(p.includes('英文'));
  });
  await ok('E4: gis prompt 包含多行内容', () => {
    assert.ok(getPrompt('gis').includes('\n'));
  });
  await ok('E5: getPrompt 返回的是引用（每次同 scope 内容相同）', () => {
    assert.strictEqual(getPrompt('gis'), getPrompt('gis'));
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
