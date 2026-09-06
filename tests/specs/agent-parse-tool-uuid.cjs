// tests/specs/agent-parse-tool-uuid.cjs
// 周期 1 P1-4: parseToolTags 的 id 用 crypto.randomUUID()，避免同毫秒 id 冲突。

'use strict';

const path = require('path');
const { parseToolTags } = require(path.resolve(__dirname, '..', '..', 'server', 'agent', 'protocol', 'parse.js'));

const text = '<tool>foo(1)</tool> 中间 <tool>bar("a")</tool> 末尾 <tool>baz()</tool>';

const out = parseToolTags(text);
const ids = out.tools.map((t) => t.id);
const uuidRe = /^tool_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let pass = 0;
let fail = 0;

// 1) 3 个 tool 全部解析
{
  const ok = out.tools.length === 3;
  process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 解析出 3 个 tool (got ${out.tools.length})\n`);
  if (ok) pass += 1; else fail += 1;
}

// 2) id 形如 tool_<uuid>
{
  const ok = ids.every((id) => uuidRe.test(id));
  process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 所有 id 符合 tool_<uuid> 格式\n`);
  if (ok) pass += 1; else fail += 1;
}

// 3) 三个 id 互不相同
{
  const ok = new Set(ids).size === ids.length;
  process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 三个 id 互不相同\n`);
  if (ok) pass += 1; else fail += 1;
}

// 4) 顺序匹配：foo / bar / baz
{
  const ok = out.tools[0].function.name === 'foo'
    && out.tools[1].function.name === 'bar'
    && out.tools[2].function.name === 'baz';
  process.stdout.write(`  [${ok ? 'PASS' : 'FAIL'}] 名称顺序正确 foo/bar/baz\n`);
  if (ok) pass += 1; else fail += 1;
}

process.stdout.write(`--- spec agent-parse-tool-uuid: pass=${pass} fail=${fail} ---\n`);
if (fail > 0) process.exit(1);
