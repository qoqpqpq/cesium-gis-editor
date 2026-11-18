// tests/specs/shadow-token-duplicate-definition.cjs
// 周期 112 / UI-REFACTOR UR-3 3a：shadow token「重复定义」门禁。
//
// 背景：用户 2026-11-18 拍板 —— 「保持主题各自值，仅消除重复定义（推荐）」。
//   即 styles.css(:root 暗主题) 与 theme.css(亮主题块) 各自定义的 --shadow-sm/md/lg
//   属「主题覆写」，不是重复定义，必须保留；真正要禁止的重复有两类：
//     G1 值级重复：var(--shadow-*, <硬编码字面量>) 的 fallback 与已定义 token 值级重复
//        （周期 112 已清除 theme.css 的 --shadow-elevated fallback，本 spec 防止回归）。
//     G2 同作用域重复定义：同一 CSS 规则块内重复定义同名 --shadow* token（后者静默覆盖前者）。
//   G3 则正向锁定「主题覆写」形态，防止后续误删导致单主题阴影丢失。
//
// 确定性：纯文件解析，无网络、无计时、无随机；同 HEAD 结果恒定。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FILES = [
  path.join(ROOT, 'client', 'src', 'styles.css'),
  path.join(ROOT, 'client', 'src', 'theme.css'),
];

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

function src(file) {
  return fs.readFileSync(file, 'utf8');
}

/** 去掉 /* *\/ 与 // 注释，返回与原文等长的字符串（不可见字符替换），便于按索引对齐。 */
function stripComments(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end === -1 ? s.length : end + 2;
      out += s.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (s[i] === '/' && s[i + 1] === '/') {
      const end = s.indexOf('\n', i);
      const stop = end === -1 ? s.length : end;
      out += s.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += s[i];
      i += 1;
    }
  }
  return out;
}

/**
 * 按大括号配对切出全部规则块：[{selector, body}]。
 *  - depth===0 的字符归入 selector；'{' 使 depth=1 并开始收集 body；'}' 回落。
 *  - 跳过引号串内的字符，避免 content:'}' 之类干扰配对。
 *  - 嵌套块（@media/@keyframes 内的规则）同样被收集，其 selector 取嵌套前的顶层选择器原文，
 *    因此 body 可能包含多个内层块 —— 对本 spec 的"同名 token 是否在同一 body 内重复出现"判定仍然成立。
 */
function ruleBlocks(noComment) {
  const blocks = [];
  let depth = 0;
  let selector = '';
  let body = '';
  let quote = null;
  for (let i = 0; i < noComment.length; i += 1) {
    const c = noComment[i];
    if (quote) {
      if (c === quote && noComment[i - 1] !== '\\') quote = null;
      if (depth >= 1) body += c; else selector += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      if (depth >= 1) body += c; else selector += c;
      continue;
    }
    if (c === '{') {
      depth += 1;
      if (depth === 1) {
        body = '';
        selector += c;
      } else {
        body += c;
      }
      continue;
    }
    if (c === '}') {
      if (depth >= 1) {
        depth -= 1;
        if (depth === 0) {
          blocks.push({ selector: selector.trim(), body });
          selector = '';
          body = '';
        } else {
          body += c;
        }
      }
      continue;
    }
    if (depth >= 1) body += c; else selector += c;
  }
  return blocks;
}

(async function main() {
  console.log('=== shadow-token-duplicate-definition ===');

  const texts = FILES.map((f) => ({ file: path.relative(ROOT, f), raw: src(f), clean: stripComments(src(f)) }));

  // ── G1：禁止 var(--shadow-*, <硬编码字面量>) 的值级重复 ─────────────────────────
  await ok('G1: 无 var(--shadow-*, <字面量>) 硬编码 fallback（值级重复）', () => {
    const hits = [];
    for (const t of texts) {
      const re = /var\(\s*--shadow-[a-z0-9-]+\s*,\s*[^)]+\)/g;
      let m;
      while ((m = re.exec(t.clean)) !== null) hits.push(`${t.file}: ${m[0].trim()}`);
    }
    assert.strictEqual(hits.length, 0, `仍存在值级重复 fallback: ${hits.slice(0, 5).join(' | ')}`);
  });

  // ── G2：禁止同一规则块内重复定义同名 --shadow* token ────────────────────────────
  await ok('G2: 任一规则块内无同名 --shadow* 重复定义', () => {
    const dupes = [];
    for (const t of texts) {
      for (const b of ruleBlocks(t.clean)) {
        const names = [];
        const re = /^\s*(--shadow-[a-z0-9-]+)\s*:/gm;
        let m;
        while ((m = re.exec(b.body)) !== null) names.push(m[1]);
        const seen = new Map();
        names.forEach((n) => seen.set(n, (seen.get(n) || 0) + 1));
        for (const [n, c] of seen) {
          if (c > 1) dupes.push(`${t.file}[${b.selector.slice(0, 40)}] ${n} ×${c}`);
        }
      }
    }
    assert.strictEqual(dupes.length, 0, `同作用域重复定义: ${dupes.slice(0, 5).join(' | ')}`);
  });

  // ── G3：主题覆写形态必须保留（用户拍板：保持主题各自值）────────────────────────
  await ok('G3: --shadow-sm/md/lg 在暗主题(styles.css) 与亮主题块(theme.css) 各自定义', () => {
    const styles = texts.find((t) => t.file.endsWith('styles.css'));
    const theme = texts.find((t) => t.file.endsWith('theme.css'));
    for (const name of ['--shadow-sm', '--shadow-md', '--shadow-lg']) {
      const inStyles = (styles.clean.match(new RegExp(`(^|\\n)\\s*${name}\\s*:`, 'g')) || []).length;
      const inTheme = (theme.clean.match(new RegExp(`(^|\\n)\\s*${name}\\s*:`, 'g')) || []).length;
      assert.strictEqual(inStyles, 1, `${styles.file} 中 ${name} 定义数应为 1，实际 ${inStyles}`);
      assert.strictEqual(inTheme, 1, `${theme.file} 中 ${name} 定义数应为 1（亮主题覆写），实际 ${inTheme}`);
    }
  });

  await ok('G3b: --shadow-card-hover 在 theme.css 暗/亮两个块各自定义', () => {
    const theme = texts.find((t) => t.file.endsWith('theme.css'));
    const count = (theme.clean.match(/^\s*--shadow-card-hover\s*:/gm) || []).length;
    assert.strictEqual(count, 2, `--shadow-card-hover 应有 2 处（暗+亮），实际 ${count}`);
  });

  await ok('G3c: 亮主题覆写与暗主题 alpha 刻意不同（不得被"统一"）', () => {
    const theme = texts.find((t) => t.file.endsWith('theme.css'));
    const lightSm = /--shadow-sm\s*:\s*0 2px 8px\s+rgba\(15,\s*23,\s*42,\s*0\.06\)/.test(theme.clean);
    assert.ok(lightSm, '亮主题 --shadow-sm 的 slate-900/0.06 覆写值被改动');
  });

  // ── G4：--shadow-elevated 必须只引用 token，不残留硬编码阴影字面量 ──────────────
  await ok('G4: --shadow-elevated 仅引用 --shadow-lg（无硬编码阴影字面量）', () => {
    const theme = texts.find((t) => t.file.endsWith('theme.css'));
    const m = /--shadow-elevated\s*:\s*([^;]+);/.exec(theme.clean);
    assert.ok(m, '未找到 --shadow-elevated 定义');
    assert.strictEqual(m[1].trim(), 'var(--shadow-lg)', `--shadow-elevated 值应为 var(--shadow-lg)，实际 "${m[1].trim()}"`);
  });

  console.log(`--- summary: pass=${pass} fail=${fail} ---`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});