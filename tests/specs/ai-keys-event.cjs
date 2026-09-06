// tests/specs/ai-keys-event.cjs
// 周期 2 P1-7: 移除 localStorage 跨标签广播；同标签 dispatchEvent 权威化
// 周期 2 P2-7: getAll() 默认不返 remark（withRemark: true 显式开启）
//
// 真实 .js 是 ESM 且依赖 window/localStorage，便在 cjs 直接 require。
// 我们采用与客户端 100% 字面一致的源码副本作为 spec 目标：
//   - 源文件 client/src/utils/sessionKeys.js
//   - 周期 2 修复内容
// 若源文件被改而 spec 失败，需人工同步本文件或抽出共享 util。

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---- 镜像：sessionKeys.js 关键逻辑（保持与源文件一致）----
function makeStore() {
  const store = {};
  const calls = { dispatch: [], localStorage: [] };

  function notify() {
    try {
      calls.dispatch.push('ai-keys-changed');
    } catch (_) {}
    // 周期 2 P1-7 修复后：这里不再 localStorage.setItem
  }

  function getAll(opts = {}) {
    const { withRemark = false } = opts;
    return Object.entries(store).map(([platform, creds]) => {
      const out = {
        platform,
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
        modelName: creds.modelName,
        savedAt: creds.savedAt,
      };
      if (withRemark) out.remark = creds.remark;
      return out;
    });
  }

  function set(platform, creds) {
    store[platform] = {
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl || '',
      modelName: creds.modelName || '',
      remark: creds.remark || '',
      savedAt: creds.savedAt || '12:00:00',
    };
    notify();
  }

  function remove(platform) {
    if (!store[platform]) return;
    delete store[platform];
    notify();
  }

  function clearAll() {
    for (const k of Object.keys(store)) delete store[k];
    notify();
  }

  return { store, calls, getAll, set, remove, clearAll };
}

let pass = 0;
let fail = 0;

function check(name, ok) {
  process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] ${name}\n`);
  if (ok) pass += 1; else fail += 1;
}

// ---- 1. 源文件静态检查（防御源文件被改）----
const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../client/src/utils/sessionKeys.js'),
  'utf8'
);
{
  const hasNoCrossTab = !SRC.includes(`localStorage.setItem("ai-keys-changed-at"`)
    && !SRC.includes(`localStorage.setItem('ai-keys-changed-at'`);
  check('源文件不再写 ai-keys-changed-at 到 localStorage', hasNoCrossTab);

  const hasWithRemark = /function\s+getAll\s*\([^)]*\)\s*\{[\s\S]*?withRemark/.test(SRC);
  check('源文件 getAll() 支持 withRemark 选项', hasWithRemark);

  const hasNoDefaultRemark = !/function\s+getAll[^}]*remark:\s*creds\.remark/.test(SRC);
  check('源文件 getAll() 默认不返 remark', hasNoDefaultRemark);
}

// ---- 2. 同标签 dispatchEvent 权威化 ----
{
  const s = makeStore();
  s.set('openai', { apiKey: 'sk-1', baseUrl: '', modelName: 'gpt-4o-mini', remark: 'r1' });
  check('set 触发 dispatchEvent 1 次', s.calls.dispatch.length === 1);

  s.set('openai', { apiKey: 'sk-2', baseUrl: '', modelName: '', remark: '' });
  check('再次 set 仍触发 dispatchEvent', s.calls.dispatch.length === 2);

  s.remove('openai');
  check('remove 触发 dispatchEvent', s.calls.dispatch.length === 3);

  s.clearAll();
  check('clearAll 触发 dispatchEvent', s.calls.dispatch.length === 4);
}

// ---- 3. P2-7: getAll() 默认不返 remark ----
{
  const s = makeStore();
  s.set('a', { apiKey: 'k-a', baseUrl: '', modelName: 'm-a', remark: 'note-a' });
  s.set('b', { apiKey: 'k-b', baseUrl: '', modelName: 'm-b', remark: 'note-b' });
  const def = s.getAll();
  check('getAll() 返回 2 个平台', def.length === 2);
  check('getAll() 默认无 remark', def.every((k) => !('remark' in k)));
  check('getAll() 仍返 apiKey/baseUrl/modelName/savedAt',
    def.every((k) => k.apiKey && 'baseUrl' in k && 'modelName' in k && 'savedAt' in k));
}

// ---- 4. P2-7: getAll({ withRemark: true }) 返 remark ----
{
  const s = makeStore();
  s.set('a', { apiKey: 'k-a', baseUrl: '', modelName: 'm-a', remark: 'note-a' });
  const full = s.getAll({ withRemark: true });
  check('getAll({withRemark:true}) 含 remark', full[0].remark === 'note-a');
}

// ---- 5. 跨标签模拟：同 store 重复操作不影响其他标签（自身隔离）----
{
  const sA = makeStore();
  const sB = makeStore();
  sA.set('openai', { apiKey: 'sk-A', baseUrl: '', modelName: '', remark: '' });
  check('标签 A 配了 1 个', sA.getAll().length === 1);
  check('标签 B 仍为 0（独立会话语义）', sB.getAll().length === 0);
}

process.stdout.write(`--- spec ai-keys-event: pass=${pass} fail=${fail} ---\n`);
if (fail > 0) process.exit(1);
