// Cesium 代码沙箱：主作用域里用 AsyncFunction 执行用户/AI 生成的 Cesium 代码
//
// 设计要点：
// - 把 viewer / Cesium / scene / entities / canvas 作为命名参数注入
// - 捕获 console.{log,info,warn,error}，运行结束恢复
// - 同步抛错 -> 捕获 -> 返回结构化错误（含行号）
// - 默认超时 5 秒（避免死循环卡住页面）
//
// 注意：仅在 trusted source（用户亲手写 / 自己持有的 AI Key 调出来的输出）中执行。

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * 在给定 viewer 上执行一段 Cesium JS 代码
 * @param {object} ctx - { viewer, Cesium, scene, entities, canvas }
 * @param {string} code - JS 代码体，允许 async/await
 * @param {object} [opts] - { timeoutMs }
 * @returns {{ok: boolean, logs: Array<{level:string,args:string[]}>, error?: {message,stack?,line?}, durationMs: number}}
 */
export async function executeCesiumCode(ctx, code, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const logs = [];

  // 备份原生 console
  const orig = {};
  ['log', 'info', 'warn', 'error', 'debug'].forEach((k) => {
    orig[k] = console[k];
    console[k] = (...args) => {
      try {
        logs.push({ level: k === 'debug' ? 'log' : k, args: args.map(formatArg) });
      } catch (_) {}
      orig[k].apply(console, args);
    };
  });

  const t0 = performance.now();
  try {
    const fn = new Function(
      'viewer',
      'Cesium',
      'scene',
      'entities',
      'canvas',
      'return (async () => {\n' + code + '\n})();'
    );
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`执行超时（${timeoutMs}ms）`)), timeoutMs);
    });
    await Promise.race([fn(ctx.viewer, ctx.Cesium, ctx.scene, ctx.entities, ctx.canvas), timeoutPromise]);
    clearTimeout(timer);
    return { ok: true, logs, durationMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return {
      ok: false,
      logs,
      error: parseError(e, code),
      durationMs: Math.round(performance.now() - t0),
    };
  } finally {
    // 恢复
    Object.entries(orig).forEach(([k, fn]) => { console[k] = fn; });
  }
}

function formatArg(a) {
  if (a instanceof Error) return a.message;
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(a, (_k, v) => {
      if (v && typeof v === 'object' && (v.constructor?.name?.includes?.('Cart') || v.x !== undefined)) {
        return v.toString ? v.toString() : String(v);
      }
      return v;
    }, 2);
  } catch (_) {
    return String(a);
  }
}

function parseError(e, code) {
  const msg = e?.message || String(e);
  const stack = e?.stack || '';
  // 提取行号（V8 风格的 "at eval (...<anonymous>:LINE:COL)"）
  // wrapper 为 `return (async () => {\n${code}\n})();`，多出 2 行 wrapper，需要减回去
  let line;
  const m = stack.match(/<anonymous>:(\d+):(\d+)/);
  if (m) line = parseInt(m[1], 10) - 2;
  if (!Number.isFinite(line) || line < 1) line = undefined;
  return { message: msg, stack, line };
}

// 简易 markdown 代码块提取（流式 + 完整字符串均可）
// 返回 { inBlock, blocks: [{lang, code}], texts: [{content}], trailing }
// - blocks：识别到的 ```lang ... ``` 代码段
// - texts：代码块之外的所有普通文本（含 fence 之间的过渡文本），保留为段
//   这样下游 parseTextWithCode 可以对"裸代码"做启发式识别
// - trailing：若 inBlock 为 true，表示未闭合块的部分内容；否则为空
export function parseCodeBlocks(text) {
  const blocks = [];
  const texts = [];
  const lines = text.split('\n');
  let i = 0;
  let buf = [];
  let textBuf = [];
  let inBlock = false;
  let lang = '';

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```([a-zA-Z0-9_-]*)?\s*$/);
    if (fence) {
      // 闭合 textBuf：fence 前的所有普通文本作为一个 text 段
      if (textBuf.length) {
        texts.push({ content: textBuf.join('\n') });
        textBuf = [];
      }
      if (inBlock) {
        blocks.push({ lang: lang || 'js', code: buf.join('\n') });
        buf = [];
        lang = '';
        inBlock = false;
      } else {
        inBlock = true;
        lang = fence[1] || '';
      }
    } else if (inBlock) {
      buf.push(line);
    } else {
      textBuf.push(line);
    }
    i++;
  }
  // 末尾未闭合的 textBuf 也作为 text 段（关键：让裸代码也能进入下游启发式）
  if (!inBlock && textBuf.length) {
    texts.push({ content: textBuf.join('\n') });
  }
  return {
    inBlock,
    blocks,
    texts,
    trailing: inBlock ? buf.join('\n') : '',
  };
}

// ============ AI 工具调用标签解析 ============
// 格式：<tool>name(args)</tool>
// 例：<tool>web_search(Cesium 3D tiles example)</tool>
const TOOL_RE = /<tool>([a-z_][a-z0-9_]*)\(([^)]*)\)<\/tool>/gi;
// cycle-18 fallback: OpenAI 风格 <tool_call>{json}</...> (minimax/GPT 会用这个)
const TOOL_CALL_JSON_RE = /<\u200b?tool_call>\s*(\{[\s\S]*?\})\s*<\/\u200b?tool_call>/gi;

/**
 * 从文本中提取所有完整的工具调用
 * @returns { tools: Array<{name, args, raw, index}>, inTool: boolean, pending: string|null }
 */
export function parseToolTags(text) {
  const tools = [];
  let m;
  TOOL_RE.lastIndex = 0;
  while ((m = TOOL_RE.exec(text)) !== null) {
    tools.push({
      name: m[1],
      args: m[2].trim(),
      raw: m[0],
      index: m.index,
    });
  }
  if (tools.length === 0) {
    // Fallback: OpenAI 风格 JSON
    TOOL_CALL_JSON_RE.lastIndex = 0;
    while ((m = TOOL_CALL_JSON_RE.exec(text)) !== null) {
      try {
        const obj = JSON.parse(m[1]);
        const name = obj.name || (obj.function && obj.function.name);
        const rawArgs = obj.arguments != null ? obj.arguments : (obj.function && obj.function.arguments);
        const argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs || {});
        tools.push({
          name,
          args: argsStr,
          raw: m[0],
          index: m.index,
        });
      } catch (_) { /* ignore */ }
    }
  }
  // 流式未闭合
  const lastOpen = text.lastIndexOf('<tool>');
  const lastClose = text.lastIndexOf('</tool>');
  let pending = null;
  if (lastOpen > lastClose) {
    pending = text.slice(lastOpen);
  }
  return { tools, pending };
}

/**
 * 把含 code block + tool tag 的文本拆成 segments
 * 顺序保留：text / code / tool 交替
 * 简化策略：先切出 tool 段（按位置切分），剩余 text 段按 parseCodeBlocks 处理
 * 流式中未闭合的 tool 视为 text-pending
 */
export function messageToSegmentsFull(rawText) {
  const text = rawText || '';
  // 1) 抽 tool 标签位置
  const toolMatches = [];
  let m;
  TOOL_RE.lastIndex = 0;
  while ((m = TOOL_RE.exec(text)) !== null) {
    toolMatches.push({ start: m.index, end: m.index + m[0].length, name: m[1], args: m[2].trim() });
  }
  // 2) 处理未闭合 tool（流式）
  const lastOpen = text.lastIndexOf('<tool>');
  const lastClose = text.lastIndexOf('</tool>');
  const hasOpenTool = lastOpen > lastClose;

  const segs = [];
  let cursor = 0;
  toolMatches.forEach((t) => {
    if (cursor < t.start) {
      // 这段普通文本里可能有 code block
      segs.push(...parseTextWithCode(text.slice(cursor, t.start)));
    }
    segs.push({ type: 'tool', name: t.name, args: t.args });
    cursor = t.end;
  });
  if (cursor < text.length) {
    const tail = text.slice(cursor);
    if (hasOpenTool && tail.startsWith('<tool>')) {
      // 流式中尚未闭合 → 当 text-pending
      segs.push({ type: 'text-pending', content: tail });
    } else {
      segs.push(...parseTextWithCode(tail));
    }
  }
  return segs;
}

function parseTextWithCode(text) {
  const { inBlock, blocks, texts, trailing } = parseCodeBlocks(text || '');
  const segs = [];
  // 重新走一遍原文，按 fence 位置交替发射 text / code，保证顺序正确
  const lines = (text || '').split('\n');
  let textBuf = [];
  let i = 0;
  let blockIdx = 0;
  function flushTextBuf() {
    if (!textBuf.length) return;
    const content = textBuf.join('\n');
    const split = splitPlainTextIntoCodeAndText(content);
    split.forEach((s) => segs.push(s));
    textBuf = [];
  }
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```([a-zA-Z0-9_-]*)?\s*$/);
    if (fence) {
      flushTextBuf();
      // 闭合 fence：发射当前 block
      // blocks 数组是按出现顺序的，但 fence 一定是开/闭交替，所以遇到第一个 fence 一定是开
      // 收集代码行直到下一个 fence
      const lang = fence[1] || '';
      const codeBuf = [];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (l.match(/^```([a-zA-Z0-9_-]*)?\s*$/)) {
          // 闭合
          segs.push({ type: 'code', lang: lang || 'js', code: codeBuf.join('\n') });
          i++;
          break;
        }
        codeBuf.push(l);
        i++;
      }
      blockIdx++;
      continue;
    }
    textBuf.push(line);
    i++;
  }
  // 末尾若有剩余 textBuf
  flushTextBuf();
  // 未闭合的尾部代码块 → text-pending（继续等待闭合）
  if (inBlock && trailing) {
    segs.push({ type: 'text-pending', content: trailing });
  }
  return segs;
}

// ============ 裸代码启发式识别 ============
// 当 AI 没有把 JS 包进 ```js ... ``` 时，按行判断哪些是代码、哪些是中文解释，
// 重新拆成 text / code 段，保证前端能渲染 "▶ 应用到编辑器" 按钮。
//
// 判定规则（按行）：
// 1. 命中强代码信号 → 代码行：viewer.xxx / Cesium.xxx / entities.xxx / scene.xxx / canvas.xxx
//                       const|let|var|function|return|await|async|throw|new|import|export|class|for|while|if|else|=> 开头
//                       行尾是 `;` 或 `{` 或 `}` 或 `,`
//                       行首是 // 注释
// 2. 命中强中文信号 → 文本行：以中文为主（≥30% 字符是 CJK）、不含 ()=>{};[] 等代码符号
// 3. 空行跟随当前状态（text/code 块分隔）
// 4. 状态机：进入 code 段需要 ≥1 行强信号；离开 code 段需要 ≥1 行强中文信号
const CODE_LINE_RE = /^\s*(?:const |let |var |function |return |await |async |throw |new |import |export |class |for |while |if |else |[a-zA-Z_$][\w$]*\s*=>|viewer\.|Cesium\.|scene\.|entities\.|canvas\.|document\.|window\.|setTimeout|setInterval|console\.|JSON\.)/;
const CODE_TAIL_RE = /[;{}]\s*$/;
const COMMENT_LINE_RE = /^\s*\/\//;
const CJK_RE = /[一-龥]/g;
function isCodeLine(line) {
  if (!line) return false;
  if (COMMENT_LINE_RE.test(line)) return true;
  if (CODE_LINE_RE.test(line)) return true;
  // 形如 "},", "});", "});" 这类收尾也算代码行
  if (/^[}\]\)\s;,]+$/.test(line)) return true;
  // 行尾以 ; { } 结尾且包含等号 → 赋值
  if (CODE_TAIL_RE.test(line) && /=/.test(line)) return true;
  return false;
}
function isChineseLine(line) {
  if (!line) return false;
  if (isCodeLine(line)) return false;
  const cjk = (line.match(CJK_RE) || []).length;
  const total = [...line].length;
  if (total === 0) return false;
  // 中文占比 ≥30% 且不含代码符号
  const hasCodePunct = /[;{}()]/.test(line);
  return cjk / total >= 0.3 && !hasCodePunct;
}
function splitPlainTextIntoCodeAndText(text) {
  const lines = text.split('\n');
  const out = [];
  let buf = [];
  let mode = null; // 'text' | 'code'
  function flush() {
    if (!buf.length) return;
    const content = buf.join('\n');
    if (mode === 'code') {
      // 只在确实像代码时才当 code 块（至少 1 行强信号）
      out.push({ type: 'code', lang: 'js', code: content });
    } else {
      out.push({ type: 'text', content });
    }
    buf = [];
  }
  for (const line of lines) {
    if (line.trim() === '') {
      buf.push(line);
      continue;
    }
    if (mode === null) {
      if (isCodeLine(line)) { mode = 'code'; buf.push(line); }
      else { mode = 'text'; buf.push(line); }
      continue;
    }
    if (mode === 'code') {
      if (isCodeLine(line)) { buf.push(line); }
      else if (isChineseLine(line)) {
        flush(); mode = 'text'; buf.push(line);
      } else {
        // 既不像代码也不像中文的折行（如参数延续）→ 仍归入 code
        buf.push(line);
      }
    } else { // mode === 'text'
      if (isChineseLine(line)) { buf.push(line); }
      else if (isCodeLine(line)) {
        flush(); mode = 'code'; buf.push(line);
      } else {
        buf.push(line);
      }
    }
  }
  flush();
  // 如果只有一个 code 段且很短（≤1 行），仍然保留（用户可能只输出一行）
  // 如果整段都被判定为 code 但其实只是普通段落（含中文），上面 isChineseLine 会切回去
  return out;
}

/**
 * 流式解析助手：每收到一段 delta，就解析追加
 * 返回 { segments: Array<{type:'text'|'code', content, lang?}> }
 * - 'text'：已经稳定的普通文本（之前的 delta 部分已经成定局，可直接渲染）
 * - 'code'：一段完整代码块
 * 如果当前 inBlock 为 true，最后一段是 partial 的 'text' 等待 close
 */
export class StreamMarkdownParser {
  constructor() {
    this.lines = [];
    this.inBlock = false;
    this.lang = '';
    this.codeLines = [];
  }
  append(delta) {
    const segments = [];
    // 将 delta 按 \n 切分，处理跨行的情况
    const newLines = (this._carry ? this._carry + delta : delta).split('\n');
    this._carry = newLines.pop() ?? '';
    for (const line of newLines) this._processLine(line, segments);
    return segments;
  }
  _processLine(line, segments) {
    const fence = line.match(/^```([a-zA-Z0-9_-]*)?\s*$/);
    if (fence) {
      if (this.inBlock) {
        // 闭合代码块 -> 发射
        segments.push({ type: 'code', lang: this.lang || 'js', code: this.codeLines.join('\n') });
        this.codeLines = [];
        this.lang = '';
        this.inBlock = false;
      } else {
        this.inBlock = true;
        this.lang = fence[1] || '';
      }
      return;
    }
    if (this.inBlock) {
      this.codeLines.push(line);
    } else {
      // 普通文本：追加到最后一行 buffer（避免每行输出独立段）
      segments.push({ type: 'text', content: line });
    }
  }
  // 流结束时调用
  end() {
    const segments = [];
    if (this._carry) {
      this._processLine(this._carry, segments);
      this._carry = '';
    }
    if (this.inBlock && this.codeLines.length) {
      // 未闭合的代码块也作为代码块发射（容错）
      segments.push({ type: 'code', lang: this.lang || 'js', code: this.codeLines.join('\n') });
      this.inBlock = false;
      this.codeLines = [];
    }
    return segments;
  }
}
