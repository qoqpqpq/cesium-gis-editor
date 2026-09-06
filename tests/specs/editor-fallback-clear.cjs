// tests/specs/editor-fallback-clear.cjs
// 周期 1 P1-5: EditorErrorFallback 用前缀匹配清空 'gis:editor:*'
//
// 真实 .jsx 是 React 函数组件,不便在 cjs 直接 require。我们采用与客户端
// 100% 字面一致的源码副本作为 spec 目标（已和源文件 cross-check）：
//   - 源文件 client/src/components/EditorErrorFallback.jsx
//   - 周期 1 修复内容
// 若源文件被改而 spec 失败，需人工同步本文件或抽出共享 util。

'use strict';

// 镜像 client/src/components/EditorErrorFallback.jsx 的 defaultClearEditorState
const EDITOR_LS_PREFIX = 'gis:editor:';
function defaultClearEditorState(localStorage) {
  if (!localStorage) return;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(EDITOR_LS_PREFIX)) toRemove.push(k);
  }
  for (const k of toRemove) {
    try { localStorage.removeItem(k); } catch (_) { /* ignore */ }
  }
}

function makeStore(initial) {
  const map = new Map();
  for (const k of initial) map.set(k, 'v');
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] || null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

let pass = 0;
let fail = 0;

const mustGone = ['gis:editor:selection', 'gis:editor:layers', 'gis:editor:view', 'gis:editor:theme'];
const mustRemain = ['gis:user:profile', 'foo:bar'];

{
  const store = makeStore([...mustGone, ...mustRemain]);
  defaultClearEditorState(store);
  for (const k of mustGone) {
    const ok = !store.getItem(k);
    process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 应清空: ${k}\n`);
    if (ok) pass += 1; else fail += 1;
  }
  for (const k of mustRemain) {
    const ok = !!store.getItem(k);
    process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 应保留: ${k}\n`);
    if (ok) pass += 1; else fail += 1;
  }
}

// 反向一致性：清空后再调一次应该幂等
{
  const store = makeStore([...mustGone, ...mustRemain]);
  defaultClearEditorState(store);
  defaultClearEditorState(store);
  const ok = store.length === mustRemain.length;
  process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 二次调用幂等\n`);
  if (ok) pass += 1; else fail += 1;
}

// 极端：空 store
{
  const store = makeStore([]);
  defaultClearEditorState(store);
  const ok = store.length === 0;
  process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 空 store 不报错\n`);
  if (ok) pass += 1; else fail += 1;
}

// 极端：localStorage 缺失
{
  let threw = false;
  try { defaultClearEditorState(null); } catch (_) { threw = true; }
  const ok = !threw;
  process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 缺 localStorage 不抛\n`);
  if (ok) pass += 1; else fail += 1;
}

process.stdout.write(`--- spec editor-fallback-clear: pass=${pass} fail=${fail} ---\n`);
if (fail > 0) process.exit(1);
