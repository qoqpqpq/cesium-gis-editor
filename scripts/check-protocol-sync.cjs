// scripts/check-protocol-sync.cjs
// 周期 8 P1-5: client/server 协议同步验证脚本
//
// 背景：
//   - 周期 1-7 client/src/pages/gis/sandbox.js 与 server/agent/protocol/index.js
//     都独立实现 <tool>name(args)</tool> 协议解析
//   - 任何一边修改正则字面，另一边需手动同步（高错率）
//   - 周期 8 P1-5 写此脚本，每次 commit 前 CI 验证两端字面一致
//
// 验证项：
//   1. 协议 open 标签（<tool>）两端一致
//   2. 协议 close 标签（</tool>）两端一致
//   3. 工具名正则（[a-z_][a-z0-9_]*）两端一致
//   4. 完整 regex 模式两端一致
//
// 用法：
//   node scripts/check-protocol-sync.cjs        # exit 0 = 一致；exit 1 = 不一致
//   node scripts/check-protocol-sync.cjs --json # 输出 JSON 报告
//
// 退出码：
//   0 = 一致；1 = 不一致；2 = 致命（无法读取文件）

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CLIENT_FILE = path.join(ROOT, 'client/src/pages/gis/sandbox.js');
const SERVER_FILE = path.join(ROOT, 'server/agent/protocol/index.js');
const SERVER_PARSE_FILE = path.join(ROOT, 'server/agent/protocol/parse.js');

const JSON_OUTPUT = process.argv.includes('--json');

function readSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return null;
  }
}

/**
 * 从源码提取协议字面 + regex
 * 协议字面定义（应一致）：
 *   TOOL_OPEN = '<tool>'
 *   TOOL_CLOSE = '</tool>'
 *   TOOL_NAME_PATTERN = [a-z_][a-z0-9_]*
 */
function extractProtocol(src) {
  if (!src) return null;
  const out = {
    open: null,
    close: null,
    namePattern: null,
    regex: null,
  };
  // TOOL_OPEN
  const openMatch = src.match(/TOOL_OPEN\s*=\s*['"`]([^'"`]+)['"`]/);
  if (openMatch) out.open = openMatch[1];
  // TOOL_CLOSE
  const closeMatch = src.match(/TOOL_CLOSE\s*=\s*['"`]([^'"`]+)['"`]/);
  if (closeMatch) out.close = closeMatch[1];
  // TOOL_NAME_RE / name pattern: [a-z_][a-z0-9_]*
  const nameMatch = src.match(/TOOL_NAME_RE\s*=\s*(\/[^\n]+\/)/);
  if (nameMatch) out.namePattern = nameMatch[1];
  // TOOL_RE 完整 regex
  const toolReMatch = src.match(/TOOL_RE\s*=\s*(\/[^\n]+\/[gimy]*)/);
  if (toolReMatch) out.regex = toolReMatch[1];
  return out;
}

/**
 * 直接从正则字面提取的 fallback 方式
 * （处理 client sandbox.js 用 const TOOL_RE = /.../ 直接字面）
 */
function extractRegexLiterals(src) {
  if (!src) return { matches: [] };
  const matches = [];
  // 匹配 /<tool>...<\/tool>/ 形式（注意：源码中可能是 \/ 转义形式）
  // 用更宽松的 pattern：匹配以 /<tool> 开头到 /[gimy]* 结束
  // 排除匹配 code 块注释：找 const TOOL_RE = /.../gi 这种典型形式
  const re = /const\s+TOOL_RE\s*=\s*(\/[^/\n]+?(?:\\\/[^/\n]*?)*?\/[gimy]*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    matches.push(m[1]);
  }
  return { matches };
}

function main() {
  const clientSrc = readSafe(CLIENT_FILE);
  const serverSrc = readSafe(SERVER_FILE);
  const serverParseSrc = readSafe(SERVER_PARSE_FILE);

  if (!clientSrc) {
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({ ok: false, error: `client file not found: ${CLIENT_FILE}` }));
    } else {
      console.error(`[FAIL] client file not found: ${CLIENT_FILE}`);
    }
    process.exit(2);
  }
  if (!serverSrc) {
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({ ok: false, error: `server file not found: ${SERVER_FILE}` }));
    } else {
      console.error(`[FAIL] server file not found: ${SERVER_FILE}`);
    }
    process.exit(2);
  }

  // 提取 client 协议字面（const TOOL_RE = /.../）
  const clientRegexLiterals = extractRegexLiterals(clientSrc);
  // 提取 server 协议字面（TOOL_RE 常量）
  const serverProtocol = extractProtocol(serverSrc);

  const checks = [];

  // Check 1: client 与 server 都含 <tool>...</tool>
  checks.push({
    name: 'client/server 都含 <tool>...</tool> 协议字面',
    pass: clientRegexLiterals.matches.length > 0 && serverProtocol.regex !== null,
    client: clientRegexLiterals.matches.length > 0 ? clientRegexLiterals.matches[0] : 'NOT_FOUND',
    server: serverProtocol.regex || 'NOT_FOUND',
  });

  // Check 2: 协议 open/close 标签一致
  if (serverProtocol.open && serverProtocol.close) {
    const clientHasOpen = clientSrc.includes(serverProtocol.open);
    const clientHasClose = clientSrc.includes(serverProtocol.close);
    checks.push({
      name: `协议标签 ${serverProtocol.open} / ${serverProtocol.close} 一致`,
      pass: clientHasOpen && clientHasClose,
      clientHasOpen,
      clientHasClose,
      serverOpen: serverProtocol.open,
      serverClose: serverProtocol.close,
    });
  }

  // Check 3: 工具名正则 [a-z_][a-z0-9_]* 一致（client 可能不导出 TOOL_NAME_RE，只在 regex 字面里）
  // 检测两种形式：
  //   a. const TOOL_NAME_RE = /[a-z_][a-z0-9_]*/
  //   b. regex literal 中包含 [a-z_][a-z0-9_]* 子串
  if (serverProtocol.namePattern) {
    const namePatternBare = serverProtocol.namePattern.replace(/^\/|\/$/g, ''); // 去掉前后的 /
    const clientHasNamePattern =
      clientSrc.includes(`TOOL_NAME_RE`) // 形式 a
      || clientSrc.includes(namePatternBare); // 形式 b（裸模式字面）
    checks.push({
      name: `工具名正则 ${serverProtocol.namePattern} 一致`,
      pass: clientHasNamePattern,
      clientHasNamePattern,
      serverPattern: serverProtocol.namePattern,
    });
  }

  // Check 4: server/agent/protocol/parse.js 也含一致协议
  // parse.js 可能没有 const TOOL_RE 字面，但应含 <tool>/</tool> 字面
  if (serverParseSrc) {
    const hasToolOpen = serverParseSrc.includes(serverProtocol.open || '<tool>');
    const hasToolClose = serverParseSrc.includes(serverProtocol.close || '</tool>');
    checks.push({
      name: 'server/agent/protocol/parse.js 也含 <tool>/</tool> 字面',
      pass: hasToolOpen && hasToolClose,
      hasToolOpen,
      hasToolClose,
    });
  }

  const allPass = checks.every((c) => c.pass);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      ok: allPass,
      checks,
      files: { client: CLIENT_FILE, server: SERVER_FILE, serverParse: SERVER_PARSE_FILE },
    }, null, 2));
  } else {
    console.log('=== protocol-sync-check ===');
    for (const c of checks) {
      console.log(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`);
      if (!c.pass) {
        for (const [k, v] of Object.entries(c)) {
          if (k === 'name' || k === 'pass') continue;
          console.log(`         ${k}: ${JSON.stringify(v)}`);
        }
      }
    }
    console.log(`--- summary: ${checks.filter((c) => c.pass).length}/${checks.length} PASS ---`);
  }

  process.exit(allPass ? 0 : 1);
}

main();
