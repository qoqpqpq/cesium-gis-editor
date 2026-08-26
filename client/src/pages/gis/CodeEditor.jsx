// GIS 页面代码编辑器（CodeMirror 6 驱动）
// - 输入 / 高亮 / 行号 / 撤销 / IME 全部由 CM 处理，自带 wrap 行号对齐
// - 工具栏：Run / 示例 / 清空 / Ask AI / 重置 / 清空控制台 / 折叠面板
// - 控制台：捕获 sandbox 中的 console.* 输出，支持点击错误跳行
// - 代码与控制台之间可拖拽分割

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { executeCesiumCode } from "./sandbox.js";
import { EXAMPLES, DEFAULT_CODE } from "./examples.js";

const STORAGE_KEY = "gis-editor-code";
const SPLIT_KEY = "gis-dock-split";

function loadStored(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v != null ? v : fallback;
  } catch (_) {
    return fallback;
  }
}

function formatTime(t) {
  const d = new Date(t);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

// 跳转到指定行（解析 sandbox 错误返回的 line → CM state）
function jumpToLine(view, line) {
  if (!view) return;
  const doc = view.state.doc;
  if (line < 1 || line > doc.lines) return;
  const pos = doc.line(line).from;
  view.dispatch({
    selection: { anchor: pos, head: pos },
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
  });
  view.focus();
}

// ============ 代码分享 URL ============
// 把当前代码压缩后写到 URL hash（不走 query 避免 router 重新挂载），
// 同时拼成完整可分享 URL 复制到剪贴板。借鉴 Cesium Sandcastle 的 ?code= 思路。
function encodeShareCode(text) {
  try {
    // TextEncoder 走 UTF-8 → URL-safe Base64
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (_) {
    return "";
  }
}

function decodeShareCode(b64) {
  try {
    let s = b64.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch (_) {
    return null;
  }
}

// 监听 URL hash 里的 ?code= ；首次进入若带 code 自动替换编辑器内容
function readShareCodeFromUrl() {
  try {
    const hash = window.location.hash || "";
    const m = hash.match(/[#?&]code=([^&]+)/);
    if (!m) return null;
    return decodeShareCode(decodeURIComponent(m[1]));
  } catch (_) {
    return null;
  }
}

export default function CodeEditor({
  ctxRef,
  editorRef,
  onApply,
  onConsoleLog,
  onCollapse,
  onAskAI,
  onJumpToLine,
  onSendLogToAI,
}) {
  // 编辑器内容（镜像 CM state，供 Ask AI / Run / 显示用）
  // 若 URL hash 带 ?code=xxx 则优先使用分享代码（让"分享链接"打开后直接落到运行态）
  const [code, setCode] = useState(() => {
    const shared = readShareCodeFromUrl();
    return shared || loadStored(STORAGE_KEY, DEFAULT_CODE);
  });
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [split, setSplit] = useState(() => {
    const v = parseFloat(loadStored(SPLIT_KEY, "0.7"));
    return Number.isFinite(v) ? Math.min(0.9, Math.max(0.3, v)) : 0.7;
  });

  const editorContainerRef = useRef(null);
  const viewRef = useRef(null);
  const outputListRef = useRef(null);
  const splitContainerRef = useRef(null);
  const dragRef = useRef(null);
  const runRef = useRef(null); // 让 keymap 可以调到最新 run
  // ===== 代码右键菜单 state/ref =====
  const [ctxMenu, setCtxMenu] = useState(null);
  const ctxMenuRef = useRef(null);
  const lastErrorRef = useRef(null); // 镜像 lastError 供 ctx menu 用（避免每帧重渲染）
  // ===== 当前激活的示例 + 验证结果 =====
  const [activeExampleId, setActiveExampleId] = useState(null);
  const activeExampleIdRef = useRef(null); // 镜像 state，让 runRef.current（不重渲染）能读到
  const [verification, setVerification] = useState(null); // { ok, results: [{name, expect, actual, pass}] }

  const errorCount = logs.filter((l) => l.level === "error").length;

  // 把 run() 包装在 ref 里，使 keymap 永远拿到最新版本
  useEffect(() => {
    runRef.current = async () => {
      const ctx = ctxRef.current;
      if (!ctx || !ctx.viewer) {
        appendLog({ level: "error", args: ["Cesium viewer 未就绪，请等待地球渲染完成"] });
        lastErrorRef.current = { message: 'Cesium viewer 未就绪', line: null };
        return;
      }
      // 跑前快照 features 数量（用于 expected.featureDelta 对比）
      // 注：editorRef 是 prop，每帧都拿最新值；ctxRef 里的 editorApi 只在 viewer 初始化时 snapshot
      const editor = editorRef?.current || ctxRef.current?.editorApi;
      const featuresBefore = editor?.getFeatures?.().length ?? null;
      setRunning(true);
      const r = await executeCesiumCode(ctx, code);
      setRunning(false);
      r.logs.forEach(appendLog);
      // 失败 / 成功都要进入 verification 流程；用 lastError 记录错误但继续跑
      if (!r.ok) {
        const msg = `${r.error.message}${r.error.line ? ` (line ~${r.error.line})` : ""}`;
        appendLog({ level: "error", args: [msg] });
        lastErrorRef.current = { message: r.error.message, line: r.error.line || null };
        // 不 return —— 继续走 verification，把"未完成"也显示出来
      } else {
        appendLog({ level: "info", args: [`✓ 执行完成（${r.durationMs}ms）`] });
        lastErrorRef.current = null;
      }
      // ===== 如果是示例代码，对比 expected =====
      const activeId = activeExampleIdRef.current;
      if (activeId) {
        const ex = EXAMPLES.find((e) => e.id === activeId);
        if (ex && ex.expected) {
          const featuresAfter = editor?.getFeatures?.().length ?? null;
          const allLogText = r.logs.map((l) => (l.args || []).join(' ')).join('\n');
          const results = [];
          // 1) featureDelta 对比
          if (typeof ex.expected.featureDelta === 'number' && featuresBefore !== null && featuresAfter !== null) {
            const actualDelta = featuresAfter - featuresBefore;
            results.push({
              name: `feature 数量变化`,
              expect: `${ex.expected.featureDelta >= 0 ? '+' : ''}${ex.expected.featureDelta}`,
              actual: `${actualDelta >= 0 ? '+' : ''}${actualDelta}`,
              pass: actualDelta === ex.expected.featureDelta,
            });
          }
          // 2) noEntityChange 对比
          if (ex.expected.noEntityChange && featuresBefore !== null && featuresAfter !== null) {
            results.push({
              name: `feature 数量不变`,
              expect: '不变',
              actual: `${featuresAfter - featuresBefore >= 0 ? '+' : ''}${featuresAfter - featuresBefore}`,
              pass: featuresAfter === featuresBefore,
            });
          }
          // 3) logIncludes
          if (ex.expected.logIncludes) {
            const hit = allLogText.includes(ex.expected.logIncludes);
            results.push({
              name: `日志包含「${ex.expected.logIncludes}」`,
              expect: '包含',
              actual: hit ? '✓ 已包含' : '✗ 未出现',
              pass: hit,
            });
          }
          // 4) logMatches（regex）
          if (ex.expected.logMatches) {
            const re = ex.expected.logMatches instanceof RegExp
              ? ex.expected.logMatches
              : new RegExp(ex.expected.logMatches);
            const hit = re.test(allLogText);
            results.push({
              name: `日志匹配 ${String(ex.expected.logMatches)}`,
              expect: '匹配',
              actual: hit ? '✓ 已匹配' : '✗ 未匹配',
              pass: hit,
            });
          }
          const ok = results.length > 0 && results.every((r) => r.pass);
          setVerification({ ok, results, hint: ex.expected.hint });
          // 写一条 INFO/ERROR 综合结论
          appendLog({
            level: ok ? 'info' : 'error',
            args: [ok
              ? `✓ 示例「${ex.title}」验证通过（${results.filter((r) => r.pass).length}/${results.length}）`
              : `✗ 示例「${ex.title}」验证未通过（${results.filter((r) => r.pass).length}/${results.length} 通过）`],
          });
        }
      }
    };
  }, [code, ctxRef]);

  async function run() {
    if (runRef.current) await runRef.current();
  }

  const appendLog = (entry) => {
    setLogs((arr) => {
      const next = arr.length >= 200 ? arr.slice(arr.length - 199) : arr.slice();
      next.push({ ...entry, t: Date.now() });
      return next;
    });
    onConsoleLog && onConsoleLog(entry);
  };

  // 初始化 CodeMirror（仅挂载时一次）
  useEffect(() => {
    if (!editorContainerRef.current) return;
    // 优先使用 ?code= 分享代码，其次 localStorage，最后默认
    const initialDoc =
      readShareCodeFromUrl() || loadStored(STORAGE_KEY, DEFAULT_CODE);
    const startState = EditorState.create({
      doc: initialDoc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        drawSelection(),
        javascript(),
        oneDark,
        keymap.of([
          {
            key: "Ctrl-Enter",
            mac: "Cmd-Enter",
            preventDefault: true,
            run: () => {
              run();
              return true;
            },
          },
          {
            // Ctrl+Shift+Z / Ctrl+Y = 重做
            key: "Ctrl-Shift-z",
            mac: "Cmd-Shift-z",
            preventDefault: true,
            run: () => {
              try {
                const e = editorRef?.current;
                if (e && typeof e.redo === 'function') {
                  const r = e.redo();
                  if (r && r.ok) appendLog({ level: 'info', args: [`↪ 已重做：${r.label}`] });
                }
              } catch (err) {
                appendLog({ level: 'error', args: ['重做失败：' + err.message] });
              }
              return true;
            },
          },
          {
            key: "Ctrl-y",
            preventDefault: true,
            run: () => {
              try {
                const e = editorRef?.current;
                if (e && typeof e.redo === 'function') {
                  const r = e.redo();
                  if (r && r.ok) appendLog({ level: 'info', args: [`↪ 已重做：${r.label}`] });
                }
              } catch (err) {
                appendLog({ level: 'error', args: ['重做失败：' + err.message] });
              }
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newCode = update.state.doc.toString();
            setCode(newCode);
            try { localStorage.setItem(STORAGE_KEY, newCode); } catch (_) {}
          }
        }),
      ],
    });
    const view = new EditorView({
      state: startState,
      parent: editorContainerRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 右键菜单：拦截原生 contextmenu，根据 CM selection 与最后错误提供 3 项 =====
  useEffect(() => {
    const host = editorContainerRef.current;
    if (!host) return undefined;
    const onCtxMenu = (e) => {
      const view = viewRef.current;
      if (!view) return;
      // 阻止浏览器原生菜单
      e.preventDefault();
      const sel = view.state.selection.main;
      const selectedText = view.state.doc.sliceString(sel.from, sel.to);
      // 计算点击位置对应的 doc 位置（用于"这一行"功能）
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? sel.head;
      // 关键：先把行号 + 行文本快照下来，避免菜单打开后 view 重启/HMR/重置导致 pos 越界
      let lineNo = 0, lineText = '';
      try {
        const doc = view.state.doc;
        if (pos >= 0 && pos <= doc.length) {
          lineNo = doc.lineAt(pos).number;
          lineText = doc.line(lineNo).text;
        } else {
          // pos 越界时退回到当前 selection 头
          lineNo = doc.lineAt(Math.max(0, Math.min(sel.head, doc.length - 1))).number;
          lineText = doc.line(lineNo).text;
        }
      } catch (err) {
        // 兜底
      }
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        hasSelection: sel.from !== sel.to,
        selectedText,
        pos: lineNo, // 改成行号而非 pos，避免 doc 长度变化时越界
        lineNo,
        lineText,
        // 快照错误，避免菜单打开后 lastErrorRef 变化导致渲染抖动
        snapshotError: lastErrorRef.current,
      });
    };
    const onDocClick = (e) => {
      if (!ctxMenu) return;
      if (ctxMenuRef.current && ctxMenuRef.current.contains(e.target)) return;
      setCtxMenu(null);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setCtxMenu(null); };
    host.addEventListener('contextmenu', onCtxMenu);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      host.removeEventListener('contextmenu', onCtxMenu);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [ctxMenu]);

  // ===== 同步 lastError 让 ctx menu 可以读到 =====
// （在 runRef.current 内已经直接写 lastErrorRef.current，无需独立 effect）

  // 监听 AI 应用代码（window 自定义事件）
  useEffect(() => {
    const handler = (e) => {
      const newCode = e.detail?.code;
      if (typeof newCode !== "string") return;
      const view = viewRef.current;
      if (!view) return;
      // 把当前编辑器内容入栈（撤销用），最多保留 10 个历史版本
      const currentDoc = view.state.doc.toString();
      pushHistory(currentDoc);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: newCode },
      });
      view.focus();
      appendLog({ level: "info", args: ["已应用 AI 生成的代码到编辑器"] });
    };
    window.addEventListener("gis-apply-code", handler);
    return () => window.removeEventListener("gis-apply-code", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 历史撤销栈：AI 覆盖 / 加载示例前 push 一份，撤销时回滚 =====
  // 用 ref 而非 state：避免无谓重渲染
  const historyRef = useRef([]);
  const pushHistory = (text) => {
    const arr = historyRef.current;
    if (arr.length > 0 && arr[arr.length - 1] === text) return; // 与上次相同就不入栈
    arr.push(text);
    if (arr.length > 10) arr.shift();
  };
  const undoHistory = () => {
    const arr = historyRef.current;
    const view = viewRef.current;
    if (!arr.length || !view) return;
    const prev = arr.pop();
    // 当前内容也要入一次"再来一次能恢复"——但当前就是被覆盖的目标，再 pop 会丢
    // 策略：把当前内容作为新栈顶再恢复时 push 回来
    const currentDoc = view.state.doc.toString();
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: prev },
    });
    view.focus();
    // 联动：撤销代码后，把 EditorPanel undo stack 里最后一个 entity 创建也撤回
    // 这样 ⏪ 不只回退"代码字符"，还回退"地球上的 entity"，让撤销闭环
    let undoNote = '';
    try {
      const e = editorRef?.current;
      if (e && typeof e.undo === 'function') {
        const r = e.undo();
        if (r && r.ok) undoNote = ` · 同时撤回 entity：${r.label}`;
        else if (r && r.reason === 'empty') undoNote = ' · 无 entity 可撤回';
      }
    } catch (err) {
      undoNote = ' · entity 撤回失败：' + err.message;
    }
    appendLog({ level: 'info', args: [`⏪ 已撤销到上一版（剩余 ${arr.length} 步）${undoNote}`] });
    // 再入一次"撤销前的状态"到栈顶（让 redo 可用——简易实现：再撤销一次能跳到撤销前）
    arr.push(currentDoc);
    if (arr.length > 11) arr.shift();
  };

  // 监听 console 日志事件（来自 sandbox / orchestrator）
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) appendLog(e.detail);
    };
    window.addEventListener("gis-console-log", handler);
    return () => window.removeEventListener("gis-console-log", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 控制台自动滚到底
  useEffect(() => {
    if (outputListRef.current) {
      outputListRef.current.scrollTop = outputListRef.current.scrollHeight;
    }
  }, [logs]);

  function loadExample(id) {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (ex && viewRef.current) {
      // 把当前内容入栈（撤销用）
      pushHistory(viewRef.current.state.doc.toString());
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: ex.code },
      });
      viewRef.current.focus();
      // 立即写 localStorage，避免"自动 run"事件拿不到最新代码（updateListener 是 debounced 的）
      try { localStorage.setItem(STORAGE_KEY, ex.code); } catch (_) {}
      appendLog({ level: "info", args: [`加载示例：${ex.title}`] });
      // 记录激活示例 id 用于 verification 对比
      setActiveExampleId(id);
      activeExampleIdRef.current = id; // 同步给 ref，避免 runRef.current 内 useEffect 重渲染未完成时拿到旧值
      setVerification(null); // 新的运行清空旧结果
      // 自动运行：用户选完示例通常想立刻看到结果，再点 Run 是断链
      // 用 setTimeout 把 dispatch 推到下一个 tick，让 CodeMirror 先完成 state 更新
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("gis-run-code"));
      }, 60);
    }
  }

  function clearCode() {
    if (!confirm("清空编辑器 + 移除地球上所有内容（实体/数据源/图层）？")) return;
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "" },
      });
      view.focus();
    }
    // 通知 index.jsx 清空场景 + 已加载文件列表
    window.dispatchEvent(new CustomEvent("gis-clear-scene"));
    appendLog({
      level: "info",
      args: ["编辑器已清空 + 已派发 gis-clear-scene（地球内容将由父组件清除）"],
    });
  }

  function clearOutput() {
    setLogs([]);
  }

  // Ask AI：把当前选中片段 / 整篇代码拼成 prompt，**填到 AI 输入框**让用户改完再发
  // 走 window 'ai-set-input' 事件，AiSidePanel 监听后 setInput + 聚焦
  function handleAskAI() {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const selText = sel.empty ? "" : view.state.sliceDoc(sel.from, sel.to);
    const fullCode = view.state.doc.toString();
    const target = selText || fullCode;
    const isSelection = !!selText;
    const prefix = isSelection
      ? "【编辑器选中片段】\n```js\n" + target + "\n```\n\n请基于上面的代码："
      : "【当前编辑器完整代码】\n```js\n" + target + "\n```\n\n请基于上面的代码：";
    window.dispatchEvent(new CustomEvent("ai-set-input", { detail: prefix }));
  }

  // 截图导出：把当前 Cesium canvas + overlay（entity 弹窗 / 信息框）一起 toBlob 后下载
  // 通过 gis-screenshot 事件让 index.jsx 调用 viewer.canvas.toBlob 处理
  // （CodeEditor 拿不到 viewer 引用，所以走事件）
  function handleScreenshot() {
    appendLog({ level: "info", args: ["📸 正在生成截图…"] });
    window.dispatchEvent(new CustomEvent("gis-screenshot"));
  }

  // 分享：把当前编辑器代码打包到 URL hash（不触发 router 重新挂载），
  // 同时拼成完整 URL 复制到剪贴板，并在控制台 toast 反馈
  async function handleShareCode() {
    const view = viewRef.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const enc = encodeShareCode(text);
    if (!enc) {
      appendLog({ level: "error", args: ["分享失败：编码异常"] });
      return;
    }
    // 拼到当前 URL 的 hash（避免走 router → 重新挂载整页）
    const base = window.location.origin + window.location.pathname + window.location.search;
    const url = `${base}#code=${enc}`;
    // 更新当前地址栏的 hash，让用户看到分享后地址已变
    try { window.history.replaceState(null, "", `#code=${enc}`); } catch (_) {}
    // 复制到剪贴板
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch (_) {}
    if (!copied) {
      // 兜底：textarea + execCommand（旧浏览器 / 非安全上下文）
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        copied = true;
      } catch (_) {}
    }
    appendLog({
      level: "info",
      args: [
        copied
          ? `🔗 分享链接已复制到剪贴板（${text.length} chars / ${enc.length} b64）`
          : `🔗 分享链接已生成（自动复制失败）：${url}`,
      ],
    });
    // 同时通过 toast 事件通知父组件
    window.dispatchEvent(
      new CustomEvent("gis-share-code", {
        detail: { url, chars: text.length, copied },
      })
    );
  }

  // 控制台错误行点击 → 跳到对应行
  function jumpLogLine(lineNum) {
    jumpToLine(viewRef.current, lineNum);
  }

  // 拖拽分割条（上下：code / console）
  const startDragSplit = useCallback((e) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startY = e.clientY;
    const startSplit = split;

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev) => {
      const delta = (ev.clientY - startY) / rect.height;
      const next = Math.min(0.9, Math.max(0.3, startSplit + delta));
      setSplit(next);
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { localStorage.setItem(SPLIT_KEY, String(split)); } catch (_) {}
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [split]);

  // 行号数字渲染（让 Ask AI 能拿到当前选中/全文）
  const editorMeta = useMemo(() => {
    const view = viewRef.current;
    if (!view) return { lineCount: 0 };
    return { lineCount: view.state.doc.lines };
  }, [code]);

  return (
    <div className="code-dock" ref={splitContainerRef}>
      {/* ===== 顶部工具栏 ===== */}
      <div className="code-dock-toolbar">
        <div className="toolbar-left">
          <button
            className="sandcastle-run-btn"
            onClick={run}
            disabled={running}
            title="Ctrl/⌘ + Enter 运行代码"
          >
            <span className="run-icon">{running ? "⏳" : "▶"}</span>
            <span className="run-label">Run</span>
            <span className="run-kbd">Ctrl ↵</span>
          </button>

          <div className="toolbar-divider" />

          <select
            className="sandcastle-select"
            aria-label="加载示例代码"
            title="加载示例代码"
            onChange={(e) => {
              if (e.target.value) {
                loadExample(e.target.value);
                e.target.value = "";
              }
            }}
          >
            <option value="">📚 示例</option>
            {EXAMPLES.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.title}</option>
            ))}
          </select>

          <button className="sandcastle-icon-btn" onClick={clearCode} title="清空代码 + 移除地球上所有实体">
            🗑️
          </button>

          <div className="toolbar-divider" />

          <button
            className="sandcastle-ai-btn"
            onClick={handleAskAI}
            title="把当前编辑器代码或选区拼成 prompt 填到 AI 输入框（不直接发送）"
          >
            🤖 Ask AI
          </button>

          <button
            className="sandcastle-icon-btn"
            onClick={() => window.dispatchEvent(new CustomEvent("gis-reset-scene"))}
            title="重置 Cesium 场景（清除所有 imagery，恢复默认视角）"
          >
            🔄
          </button>

          <button
            className="sandcastle-icon-btn"
            onClick={handleScreenshot}
            title="导出当前 Cesium 视图为 PNG（带时间戳水印）"
          >
            📸 截图
          </button>

          <button
            className="sandcastle-icon-btn"
            onClick={undoHistory}
            title="撤销到上一版代码（AI 覆盖前 / 加载示例前的状态），同时撤回最后一次 entity"
            disabled={historyRef.current.length === 0}
          >
            ⏪ 撤销
          </button>

          <button
            className="sandcastle-icon-btn"
            onClick={() => {
              try {
                const e = editorRef?.current;
                if (e && typeof e.redo === 'function') {
                  const r = e.redo();
                  if (r && r.ok) appendLog({ level: 'info', args: [`↪ 已重做：${r.label}`] });
                  else appendLog({ level: 'info', args: ['↪ 无可重做内容'] });
                }
              } catch (err) {
                appendLog({ level: 'error', args: ['重做失败：' + err.message] });
              }
            }}
            title="重做（Ctrl+Shift+Z / Ctrl+Y）"
          >
            ↪ 重做
          </button>

          <button
            className="sandcastle-icon-btn"
            onClick={handleShareCode}
            title="把当前代码打包成可分享 URL（Sandcastle 风格 ?code= 链接）"
          >
            🔗 分享
          </button>
        </div>

        <div className="toolbar-right">
          <div className="console-stats">
            {logs.length > 0 && (
              <span className="stat-badge stat-info" title="总日志数">📝 {logs.length}</span>
            )}
            {errorCount > 0 && (
              <span className="stat-badge stat-err" title="错误数">❌ {errorCount}</span>
            )}
          </div>
          <button className="sandcastle-icon-btn" onClick={clearOutput} title="清空控制台">🧹 清空</button>
          {onCollapse && (
            <button className="sandcastle-icon-btn collapse-btn" onClick={onCollapse} aria-label="折叠代码编辑面板" title="折叠面板">{"<<"}</button>
          )}
        </div>
      </div>

      {/* ===== CodeMirror 容器 ===== */}
      <div className="code-pane" style={{ flex: `${split} 0 0` }}>
        <div className="code-editor">
          <div ref={editorContainerRef} className="cm-host" />
        </div>
      </div>

      {/* ===== 代码右键菜单（选中代码 / 错误行 → 让 AI 改造）=====
          用捕获模式拦截原生 contextmenu，根据 CM selection 与 lastError 提供 3 项 */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="code-context-menu"
          style={{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ctx-item"
            disabled={!ctxMenu.hasSelection}
            onClick={() => {
              const t = ctxMenu.selectedText || '';
              window.dispatchEvent(new CustomEvent('ai-set-input', {
                detail: `请把下面这段代码改写成更清晰 / 更高效的写法（保持功能不变）：\n\n\`\`\`js\n${t}\n\`\`\``,
              }));
              setCtxMenu(null);
            }}
          >
            ✨ 让 AI 改造这段
            <span className="ctx-hint">{ctxMenu.hasSelection ? `${ctxMenu.selectedText.length} 字符` : '先选中代码'}</span>
          </button>

          {/* 复制 / 剪切：原生 Ctrl+C 已支持，但右键菜单加上更直观；不在选中态时仅显示"复制整段" */}
          {ctxMenu.hasSelection ? (
            <>
              <button
                className="ctx-item"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(ctxMenu.selectedText || '');
                    appendLog({ level: 'info', args: [`📋 已复制 ${ctxMenu.selectedText.length} 字符到剪贴板`] });
                  } catch (e) {
                    appendLog({ level: 'error', args: ['复制失败：' + e.message] });
                  }
                  setCtxMenu(null);
                }}
              >
                📋 复制选中段
                <span className="ctx-hint">{ctxMenu.selectedText.length} 字符</span>
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(ctxMenu.selectedText || '');
                    const view = viewRef.current;
                    if (view) {
                      const sel = view.state.selection.main;
                      view.dispatch({ changes: { from: sel.from, to: sel.to } });
                    }
                    appendLog({ level: 'info', args: [`✂️ 已剪切 ${ctxMenu.selectedText.length} 字符`] });
                  } catch (e) {
                    appendLog({ level: 'error', args: ['剪切失败：' + e.message] });
                  }
                  setCtxMenu(null);
                }}
              >
                ✂️ 剪切选中段
                <span className="ctx-hint">{ctxMenu.selectedText.length} 字符</span>
              </button>
            </>
          ) : (
            <button
              className="ctx-item"
              onClick={() => {
                try {
                  const code = viewRef.current?.state.doc.toString() || '';
                  navigator.clipboard.writeText(code);
                  appendLog({ level: 'info', args: [`📋 已复制整段代码（${code.length} 字符）`] });
                } catch (e) {
                  appendLog({ level: 'error', args: ['复制失败：' + e.message] });
                }
                setCtxMenu(null);
              }}
            >
              📋 复制整段
              <span className="ctx-hint">无选中时复制全部代码</span>
            </button>
          )}
          <button
            className="ctx-item"
            onClick={() => {
              const lineNo = ctxMenu.lineNo;
              const lineText = ctxMenu.lineText;
              if (!lineNo) { setCtxMenu(null); return; }
              window.dispatchEvent(new CustomEvent('ai-set-input', {
                detail: `第 ${lineNo} 行有问题，请只重写这一行（其它保持不变）：\n\n\`\`\`js\n${lineText || ''}\n\`\`\`\n\n（修改完后我会整文件运行）`,
              }));
              setCtxMenu(null);
            }}
          >
            🎯 让 AI 改造这一行
            <span className="ctx-hint">第 {ctxMenu.lineNo || '?'} 行</span>
          </button>
          {ctxMenu.snapshotError && (
            <button
              className="ctx-item ctx-error"
              onClick={() => {
                const e = ctxMenu.snapshotError;
                // 取整文件代码（view 已被 HMR 重建则跳过，但通常 contextmenu 开着时 view 还在）
                let fullCode = '';
                try { fullCode = viewRef.current?.state.doc.toString() || ''; } catch (_) {}
                window.dispatchEvent(new CustomEvent('ai-set-input', {
                  detail: `这段代码运行报错了：\n\n错误：${e.message}\n${e.line ? `（第 ${e.line} 行）` : ''}\n\n请只给出修复后整文件代码（不要改其它无关部分）：\n\n\`\`\`js\n${fullCode}\n\`\`\``,
                }));
                setCtxMenu(null);
              }}
            >
              🔧 让 AI 修复错误
              <span className="ctx-hint">{ctxMenu.snapshotError.message?.slice(0, 28) || ''}</span>
            </button>
          )}
        </div>
      )}

      {/* ===== 可拖拽分割条 ===== */}
      <div className="dock-vsplitter" onMouseDown={startDragSplit} title="拖拽调整代码 / 控制台区域">
        <div className="dock-vsplitter-handle" />
      </div>

      {/* ===== 控制台 ===== */}
      <div className="console-pane" style={{ flex: `${1 - split} 0 0` }}>
        <div className="console-header">
          <span className="console-title">
            <span className="console-icon">📺</span>
            控制台
          </span>
          <span className="console-hint muted small">console.* 输出 & 执行结果</span>
        </div>

        {/* ===== 示例期望比对结果 ===== */}
        {verification && (
          <div className={"verification-banner " + (verification.ok ? "pass" : "fail")}>
            <div className="verification-headline">
              {verification.ok ? '✓ 验证通过' : '✗ 验证未通过'}
              <span className="verification-count">
                {verification.results.filter((r) => r.pass).length} / {verification.results.length}
              </span>
            </div>
            <div className="verification-results">
              {verification.results.map((r, i) => (
                <div key={i} className={"verification-row " + (r.pass ? "pass" : "fail")}>
                  <span className="v-icon">{r.pass ? '✓' : '✗'}</span>
                  <span className="v-name">{r.name}</span>
                  <span className="v-actual">{r.actual}</span>
                </div>
              ))}
            </div>
            {verification.hint && (
              <div className="verification-hint">💡 {verification.hint}</div>
            )}
          </div>
        )}
        {logs.length === 0 ? (
          <div className="console-empty muted small">
            暂无输出。运行代码或让 AI 生成代码后点击 ▶ Run 即可在此查看 console / 错误。
          </div>
        ) : (
          <div className="output-list" ref={outputListRef}>
            {logs.map((l, i) => {
              const lineMatch = (l.args.join(" ") || "").match(/\(\s*line\s*[~]?\s*(\d+)\s*\)/i);
              const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : null;
              const isErr = l.level === "error";
              return (
                <div
                  key={i}
                  className={"output-line level-" + l.level + (lineNum && isErr ? " clickable" : "")}
                  onClick={() => {
                    if (lineNum && isErr) jumpLogLine(lineNum);
                    if (onJumpToLine) onJumpToLine(lineNum);
                  }}
                  title={lineNum && isErr ? `点击跳转到第 ${lineNum} 行` : undefined}
                >
                  <span className="output-time">{formatTime(l.t)}</span>
                  <span className="output-tag">{l.level}</span>
                  <span className="output-text">{l.args.join(" ")}</span>
                  {lineNum && isErr && <span className="output-line-badge">→ {lineNum}</span>}
                  <button
                    className="output-send-ai"
                    title="把这条日志填到 AI 输入框（不直接发送）"
                    onClick={(e) => {
                      e.stopPropagation();
                      const isErr = l.level === "error";
                      const logText = l.args.join(" ");
                      const prompt =
                        "【控制台" +
                        (isErr ? "报错" : "输出") +
                        "】\n```\n" +
                        logText +
                        "\n```\n\n请基于下面的编辑器代码分析：\n\n【编辑器代码】\n```js\n" +
                        (code || "") +
                        "\n```";
                      window.dispatchEvent(
                        new CustomEvent("ai-set-input", { detail: prompt })
                      );
                    }}
                  >
                      📤 发给 AI
                    </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}