// GIS 三维地球页面（Sandcastle 风格）
// 三列布局：代码编辑器 | Cesium 地球 | AI 助手
// - 列宽可拖拽调节（左右两个垂直分割条）
// - 每列可折叠/展开（点击折叠按钮收起为窄条）

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import { aiApi } from '../../api/index.js';
import { PRESETS } from './presets.js';
import { executeCesiumCode } from './sandbox.js';
import { buildSceneContext, formatSceneContext, headlineOf } from './aiContext.js';
import { runAgentLoop } from './aiAgent.js';
import { toolDocsForPrompt } from './aiTools.js';
import CesiumEarth from './CesiumEarth.jsx';
import AiSidePanel from './AiSidePanel.jsx';
import AiStatusBanner from './AiStatusBanner.jsx';
import CodeEditor from './CodeEditor.jsx';
import FileLoader from './FileLoader.jsx';
import EditorPanel from './editor/EditorPanel.jsx';
import ImageryTokenDialog from './ImageryTokenDialog.jsx';
import WriteToolConfirmModal from './WriteToolConfirmModal.jsx';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import EditorErrorFallback from '../../components/EditorErrorFallback.jsx';
import { readViewStateFromUrl, buildShareUrl } from '../../utils/viewState.js';
import * as sessionKeys from '../../utils/sessionKeys.js';
import AiKeySettings from '../../components/AiKeySettings.jsx';

const COLLAPSED_W = 36; // 折叠后的窄条宽度
const MIN_W = 240;      // 最小展开宽度
const CENTER_MIN = 180; // 中列保底宽度（让出更多空间给左右侧）

function loadNum(key, fallback) {
  try { const v = parseFloat(localStorage.getItem(key)); return Number.isFinite(v) ? v : fallback; }
  catch (_) { return fallback; }
}
function loadBool(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === 'true'; }
  catch (_) { return fallback; }
}

export default function GIS() {
  const cesiumRef = useRef(null);
  const editorRef = useRef(null);
  const ctxRef = useRef(null);
  const containerRef = useRef(null);
  const sandboxToastShownRef = useRef(false);

  // 坐标格式（dec / dms / utm / mgrs）—— 提升到 index 层
  // 让 CesiumEarth 内的 CursorReadout 底栏共享同一选择
  const [coordFormat, setCoordFormat] = useState(() => {
    try { return localStorage.getItem('editor.coordFormat') || 'dec'; } catch (_) { return 'dec'; }
  });
  useEffect(() => {
    try { localStorage.setItem('editor.coordFormat', coordFormat); } catch (_) {}
  }, [coordFormat]);

  // 视图

  // Toast
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // AI 会话
  const [aiMessages, setAiMessages] = useState([]);
  const [aiStreaming, setAiStreaming] = useState(false);
  const aiAbortRef = useRef(null);
  const aiXhrRef = useRef(null);

  // 阶段 2C: 启动时如果 URL 里有 view state,延迟到 viewer ready 后还原
  const pendingViewStateRef = useRef(null);
  useEffect(() => {
    const v = readViewStateFromUrl();
    if (v) pendingViewStateRef.current = v;
  }, []);

  // AI 写工具确认弹窗（promise 模式：confirmWrite({...}) → Promise<{approved}>
  const [writeConfirm, setWriteConfirm] = useState(null);
  const writeConfirmResolveRef = useRef(null);
  const confirmWrite = useCallback((req) => {
    return new Promise((resolve) => {
      writeConfirmResolveRef.current = resolve;
      setWriteConfirm(req);
    });
  }, []);

  // 最近一次代码执行错误（用于"🔧 让 AI 修代码"按钮）
  const [lastError, setLastError] = useState(null);

  // 可用 AI 平台列表 + 当前选中的平台
  const [aiPlatforms, setAiPlatforms] = useState([]);
  const [keySettingsOpen, setKeySettingsOpen] = useState(false); // 🔑 Key 设置弹窗

  // Header 里的 🔑 按钮通过 window 事件触发（App.jsx 里的按钮不在 GIS 组件作用域内）
  useEffect(() => {
    const handler = () => setKeySettingsOpen(true);
    window.addEventListener('gis-open-key-settings', handler);
    return () => window.removeEventListener('gis-open-key-settings', handler);
  }, []);
  const [aiCurrentPlatform, setAiCurrentPlatform] = useState(() => {
    try { return localStorage.getItem('ai-platform') || ''; } catch (_) { return ''; }
  });

  // AI 会话 id（每次首次发送时建一个，刷新页面保持；清空对话时也保留）
  // 用于把 usage 关联到同一会话，前端 UsagePanel 按 sessionId 展开明细
  const [aiSessionId] = useState(() => {
    try {
      let v = localStorage.getItem('ai-session-id');
      if (!v) {
        v = 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem('ai-session-id', v);
      }
      return v;
    } catch (_) {
      return 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }
  });

  // 阶段 3B：场景 AI 说明横幅
  // - 打开分享链接时（URL hash 带 aiDescription）显示
  // - 主动关闭后不再显示（除非重新打开新链接）
  const [aiSceneDesc, setAiSceneDesc] = useState(null);
  useEffect(() => {
    const v = pendingViewStateRef.current;
    if (v && v.aiDescription) {
      setAiSceneDesc({
        description: v.aiDescription,
        model: v.aiModel || '',
        camera: v.camera,
      });
      // 还原 view 后 pendingViewStateRef 就不需要了；后续 setView 会消费 camera
    }
  }, []);
  // 监听 AI 主动分享后，URL 变了，但状态没刷：再读一次
  useEffect(() => {
    const handler = () => {
      const v = readViewStateFromUrl();
      if (v && v.aiDescription) {
        setAiSceneDesc({ description: v.aiDescription, model: v.aiModel || '', camera: v.camera });
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // 编辑器状态
  const [editorCode, setEditorCode] = useState(() => {
    try { return localStorage.getItem('gis-editor-code') || ''; } catch (_) { return ''; }
  });

  // 文件上传（FileLoader 管理的已加载数据源列表）
  const [loadedFiles, setLoadedFiles] = useState([]);

  // AI 场景摘要：每 2s 轮询一次，确保 chip 与系统提示词不会停在旧的 entity 数上
  // 用户的编辑动作（画图、删除、属性改值）不冒泡到父组件，所以只能主动 poll
  const [sceneContext, setSceneContext] = useState(null);
  const sceneContextRefreshRef = useRef(() => {});
  sceneContextRefreshRef.current = () => {
    try { setSceneContext(captureSceneContext()); } catch (_) {}
  };
  useEffect(() => {
    sceneContextRefreshRef.current();
    const t = setInterval(() => sceneContextRefreshRef.current(), 2000);
    // 测试钩子：让 e2e 可强制刷新
    if (typeof window !== 'undefined') window.__refreshSceneContext = () => sceneContextRefreshRef.current();
    // 测试钩子：让 e2e 直接调沙箱执行（不走 UI）
    // runSandboxCode 内部用 ctxRef.current，所以一次绑定就够，ref 会保持最新
    if (typeof window !== 'undefined') window.__runSandbox = (code) => runSandboxCode(code);
    // 测试钩子：让 e2e 直接读取 cesiumEarth 暴露的图层抽象层
    if (typeof window !== 'undefined') {
      // 合并三个数据桶：datasource（FileLoader）+ viewer.entities 沙箱 + editor 桶（LayersTree）
      // 借鉴 kepler.gl LayerManager：所有图层走同一个名词
      const listAllLayers = () => {
        const out = [];
        // 1) cesiumEarth 的 datasource + sandbox entities
        try {
          const cesiumLayers = cesiumRef.current?.layers?.() || [];
          out.push(...cesiumLayers);
        } catch (_) {}
        // 2) editor 桶（图层 + 要素）
        try {
          const editor = editorRef.current;
          if (editor) {
            const layers = editor.getLayers?.() || [];
            const features = editor.getFeatures?.() || [];
            const byLayer = new Map();
            for (const f of features) {
              const lid = f.layer || f.layerId || 'default';
              byLayer.set(lid, (byLayer.get(lid) || 0) + 1);
            }
            for (const l of layers) {
              out.push({
                id: 'editor:' + l.id,
                name: '📐 ' + (l.name || l.id),
                source: 'editor',
                kind: 'editor-layer',
                visible: l.visible !== false,
                loading: false,
                count: byLayer.get(l.id) || 0,
                bbox: null,
              });
            }
          }
        } catch (_) {}
        return out;
      };
      window.__layers = listAllLayers;
      window.__layerVisible = (id, v) => {
        try {
          // editor 桶：调用 EditorPanel.setLayerVisibility（命令式 API 已暴露）
          if (typeof id === 'string' && id.startsWith('editor:')) {
            const layerId = id.slice('editor:'.length);
            const editor = editorRef.current;
            if (editor && typeof editor.setLayerVisibility === 'function') {
              const r = editor.setLayerVisibility({ layerId, visible: v });
              return !!(r && r.ok);
            }
            return false;
          }
          return cesiumRef.current?.setLayerVisible?.(id, v) || false;
        } catch (_) { return false; }
      };
      window.__flyToLayer = (id) => {
        try { return cesiumRef.current?.flyToLayer?.(id) || false; } catch (_) { return false; }
      };
    }

    // ===== 分享代码自动执行 =====
    // 若 URL hash 带 ?code=xxx ，等 viewer 就绪 + CodeMirror 挂载后自动运行一次
    // （借鉴 Cesium Sandcastle 的 "?code=..." 直达运行态体验）
    const shared = (() => {
      try {
        const m = (window.location.hash || '').match(/[#?&]code=([^&]+)/);
        return !!m;
      } catch (_) { return false; }
    })();
    if (shared) {
      // 等 ctx 就绪（captureCtx 由 CesiumEarth 的 onInfo 触发）→ 最多等 8s
      let waited = 0;
      const tryRun = () => {
        if (ctxRef.current && ctxRef.current.viewer) {
          // 从 localStorage / URL hash 拿当前编辑器内容（CodeMirror 已经把它持久化到 localStorage）
          // 直接调一次 runSandboxCode 即可
          const stored = (() => {
            try { return localStorage.getItem('gis-editor-code') || ''; } catch (_) { return ''; }
          })();
          if (stored) {
            setTimeout(() => runSandboxCode(stored), 250);
          }
        } else if (waited < 80) {
          waited++;
          setTimeout(tryRun, 100);
        }
      };
      // 给 CodeEditor 一点时间挂载 CodeMirror 并完成 setCode
      setTimeout(tryRun, 400);
      pushToast('🔗 检测到分享代码，将自动运行', 'info', 2500);
    }

    // 监听 "🔗 分享" 按钮 toast 事件：把分享成功结果用页面 toast 显示
    const onShare = (e) => {
      const d = e.detail || {};
      pushToast(
        d.copied
          ? `🔗 已复制分享链接（${d.chars} 字符）`
          : '🔗 分享链接已生成（剪贴板复制失败，请手动复制）',
        d.copied ? 'success' : 'info',
        2500,
      );
    };
    window.addEventListener('gis-share-code', onShare);

    // 阶段 2C + 3B: 监听"分享当前视图"事件
    // 3B 新增：调 /api/ai/scene-description 让 AI 生成 markdown 说明，嵌入 URL hash
    const onShareView = async () => {
      const api = cesiumRef.current;
      if (!api || typeof api.getCurrentViewState !== 'function') {
        pushToast('⚠️ viewer 未就绪', 'error', 2500);
        return;
      }
      const state = api.getCurrentViewState();
      if (!state) {
        pushToast('⚠️ 无法获取当前视图', 'error', 2500);
        return;
      }

      // 3B：先尝试让 AI 生成一段场景说明 markdown，嵌入 URL hash
      //   - 没选 AI 平台（auto）就跳过 AI 生成，老路径照常工作
      //   - AI 调用失败也不阻塞分享
      //   - 独立版：会话 Key 纯 session，需随请求带给后端代理
      const platform = (aiCurrentPlatform || '').trim() || (aiPlatforms[0] && aiPlatforms[0].platform) || '';
      if (platform) {
        const toastId = pushToast('🤖 正在让 AI 生成场景说明…', 'info', 15000);
        try {
          const fileStats = api.getDataSourceStats?.() || [];
          const sceneKey = sessionKeys.get(platform);
          const descResp = await aiApi.sceneDescription({
            platform,
            camera: state.camera,
            snapshot: sceneContext?.markdown || ctxRef.current?.markdown || '',
            files: fileStats.slice(0, 8).map((f) => ({
              name: f.name,
              format: f.format,
              featureCount: f.featureCount,
            })),
            editorCode: (typeof editorCode === 'string' ? editorCode : '').slice(0, 1500),
            sessionId: aiSessionId,
            style: 'concise',
            tempApiKey: sceneKey?.apiKey || undefined,
            tempBaseUrl: sceneKey?.baseUrl || undefined,
            tempModel: sceneKey?.modelName || undefined,
          });
          if (descResp && descResp.description) {
            state.aiDescription = descResp.description;
            state.aiModel = descResp.model || '';
            pushToast('✅ AI 说明生成完成', 'success', 1500);
          } else {
            pushToast('ℹ️ AI 未返回说明，跳过', 'info', 1500);
          }
        } catch (e) {
          pushToast(`⚠️ AI 说明生成失败：${e.message}（链接不含说明）`, 'error', 3000);
        }
      }

      const url = buildShareUrl(state);
      if (!url) {
        pushToast('⚠️ 生成分享链接失败', 'error', 2500);
        return;
      }
      // 更新 URL hash（避免 router 重新挂载）
      try { window.history.replaceState(null, '', url.split(window.location.origin)[1]); } catch (_) {}
      // 复制到剪贴板
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          copied = true;
        }
      } catch (_) {}
      if (!copied) {
        try {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          copied = true;
        } catch (_) {}
      }
      pushToast(
        copied
          ? (state.aiDescription ? `🔗 视图链接 + AI 说明已复制（${url.length} 字符）` : `🔗 视图链接已复制到剪贴板（${url.length} 字符）`)
          : '🔗 视图链接已生成（剪贴板复制失败，请手动复制）',
        copied ? 'success' : 'info',
        2500,
      );
    };
    window.addEventListener('gis-share-view', onShareView);

    // "选示例后自动 run"：CodeEditor 加载示例时派发此事件
    const onRunCode = () => {
      // 等 ctx 就绪（AI 没初始化完也会被拒绝）
      if (ctxRef.current && ctxRef.current.viewer) {
        runSandboxCode();
      }
    };
    window.addEventListener('gis-run-code', onRunCode);

    // 截图：CodeEditor 派发 gis-screenshot 事件 → 我们拿 viewer.canvas + overlay 一起 toBlob
    // （必须用 toBlob 而非 toDataURL：toDataURL 在大画布上会爆栈）
    // 流程：① toBlob → 下载到本地 ② FileReader 转 base64 → 派发 ai-set-input（带附件）让用户可以问 AI "这张图里是什么"
    const onScreenshot = () => {
      try {
        const v = cesiumRef.current?.getViewer?.();
        if (!v) { pushToast('⚠️ viewer 未就绪', 'error', 2500); return; }
        // Cesium 的 canvas 在画 WebGL；需要 preserveDrawingBuffer:true 才能 toBlob
        // 若没启用，则先 render 一帧再立刻 toBlob
        v.scene.render();
        v.canvas.toBlob((blob) => {
          if (!blob) { pushToast('⚠️ 截图失败：canvas 无内容', 'error', 2500); return; }
          // 水印：在右侧加上博客名 + 时间戳（不影响 viewer，纯属叠加）
          // 简易实现：直接用文件名带时间戳，并在控制台输出 base64 提示
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          a.href = url;
          a.download = `blog-gis-${ts}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          pushToast('📸 已保存截图：' + a.download, 'success', 2500);
          // 输出到控制台：派发 gis-console-log 让 CodeEditor 输出台显示
          window.dispatchEvent(new CustomEvent('gis-console-log', {
            detail: { level: 'info', args: [`📸 截图已保存：${a.download}（${(blob.size / 1024).toFixed(1)} KB）`] },
          }));
          // 联动：把截图 PNG 转 base64 后塞到 AI 输入框（用户可问 AI 解读）
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            // 存到 localStorage：aiSidePanel 在挂载或聚焦时检查这个 key 并写入输入框
            // （AiSidePanel.jsx 是压缩产物，没法直接编辑；走 localStorage 是兼容兜底）
            try {
              localStorage.setItem('gis-pending-ai-input', JSON.stringify({
                text: `我刚截了一张 GIS 视图（${a.download}，${(blob.size / 1024).toFixed(1)} KB）。请描述图中你看到了什么 / 哪些要素 / 有什么问题`,
                attachments: [{ kind: 'image', dataUrl, name: a.download, size: blob.size }],
                ts: Date.now(),
              }));
            } catch (e) {
              // localStorage 满了（base64 大图）；降级只存文字
              try {
                localStorage.setItem('gis-pending-ai-input', JSON.stringify({
                  text: `我刚截了一张 GIS 视图（${a.download}）。本地存储已满，附件未附上。`,
                  attachments: null,
                  ts: Date.now(),
                }));
              } catch (_) {}
            }
            window.dispatchEvent(new CustomEvent('ai-set-input', {
              detail: `我刚截了一张 GIS 视图（${a.download}，${(blob.size / 1024).toFixed(1)} KB）。请描述图中你看到了什么 / 哪些要素 / 有什么问题`,
            }));
            pushToast('🖼 截图已发给 AI：可点"发送"问它', 'info', 3000);
          };
          reader.readAsDataURL(blob);
        }, 'image/png');
      } catch (e) {
        pushToast('⚠️ 截图异常：' + (e.message || e), 'error', 3000);
      }
    };
    window.addEventListener('gis-screenshot', onScreenshot);

    // 阶段 3 D：NL 报告导出时需要的截图（异步捕获，回传 dataURL）
    const onRequestCapture = () => {
      try {
        const v = cesiumRef.current?.getViewer?.();
        if (!v) {
          window.dispatchEvent(new CustomEvent('nl-capture-snapshot', { detail: { dataUrl: null } }));
          return;
        }
        v.scene.render();
        v.canvas.toBlob((blob) => {
          if (!blob) {
            window.dispatchEvent(new CustomEvent('nl-capture-snapshot', { detail: { dataUrl: null } }));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            window.dispatchEvent(new CustomEvent('nl-capture-snapshot', { detail: { dataUrl: reader.result } }));
          };
          reader.readAsDataURL(blob);
        }, 'image/png');
      } catch (_) {
        window.dispatchEvent(new CustomEvent('nl-capture-snapshot', { detail: { dataUrl: null } }));
      }
    };
    window.addEventListener('nl-request-capture', onRequestCapture);
    return () => {
      clearInterval(t);
      window.removeEventListener('gis-share-code', onShare);
      window.removeEventListener('gis-share-view', onShareView);
      window.removeEventListener('gis-run-code', onRunCode);
      window.removeEventListener('gis-screenshot', onScreenshot);
      window.removeEventListener('nl-request-capture', onRequestCapture);
    };
  }, []);

  // 天地图 Token 弹窗（首次加载且未配置时弹出）
  const [showTokenDialog, setShowTokenDialog] = useState(() => {
    try {
      const hasToken = !!localStorage.getItem('cesium_tdt_token');
      const skipped = localStorage.getItem('cesium_tdt_skipped');
      return !hasToken && !skipped;
    } catch (_) { return false; }
  });

  // 用户在弹窗里手动输入的天地图 token（仅本会话内存，不持久化）
  const [tdtTokenOverride, setTdtTokenOverride] = useState('');

  // ===== 三列宽度 & 折叠状态 =====
  // 初始默认三列各占 1/3（基于当前视口宽度），保留用户已拖拽保存的自定义宽度
  const calcThird = () => {
    const mainPad = 24;       // .main-full padding-left + padding-right
    const gisPad = 24;        // .gis-container padding-left + padding-right
    const splitters = 14;     // 两个 7px 分隔条
    const usable = (window.innerWidth || 1920) - mainPad - gisPad - splitters;
    return Math.max(420, Math.round(usable / 3));
  };
  const [leftW, setLeftW] = useState(() => {
    const v = loadNum('gis-left-w', 0);
    return v >= 420 ? v : calcThird();
  });
  const [rightW, setRightW] = useState(() => {
    const v = loadNum('gis-right-w', 0);
    return v >= 420 ? v : calcThird();
  });
  const [leftCollapsed, setLeftCollapsed] = useState(() => loadBool('gis-left-collapsed', false));
  const [rightCollapsed, setRightCollapsed] = useState(() => loadBool('gis-right-collapsed', false));

  // Test Suite 已删除

  useEffect(() => { try { localStorage.setItem('gis-left-w', String(leftW)); } catch (_) {} }, [leftW]);
  useEffect(() => { try { localStorage.setItem('gis-right-w', String(rightW)); } catch (_) {} }, [rightW]);
  useEffect(() => { try { localStorage.setItem('gis-left-collapsed', String(leftCollapsed)); } catch (_) {} }, [leftCollapsed]);
  useEffect(() => { try { localStorage.setItem('gis-right-collapsed', String(rightCollapsed)); } catch (_) {} }, [rightCollapsed]);

  // 窗口 resize 时自动收紧列宽，防止 grid 溢出
  useEffect(() => {
    const handleResize = () => {
      const containerW = containerRef.current?.getBoundingClientRect()?.width;
      if (!containerW) return;
      const SPLITTERS = 14; // 两个 7px 分隔条
      const CENTER_MIN = 180;
      const MIN_W = 240;
      const maxTotal = containerW - SPLITTERS - CENTER_MIN;
      if (leftW + rightW > maxTotal) {
        // 等比缩：各自最多缩到 MIN_W
        const ratio = (maxTotal - MIN_W * 2) / (leftW + rightW - MIN_W * 2);
        if (ratio < 1) {
          const newLeft = Math.round(MIN_W + (leftW - MIN_W) * ratio);
          const newRight = Math.round(MIN_W + (rightW - MIN_W) * ratio);
          setLeftW(Math.max(MIN_W, newLeft));
          setRightW(Math.max(MIN_W, newRight));
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [leftW, rightW]);

  // 拖拽调节列宽：mousedown 时直接绑定 mousemove/mouseup
  const startDrag = useCallback((type) => (e) => {
    e.preventDefault();
    const containerW = containerRef.current?.getBoundingClientRect()?.width || window.innerWidth;
    const SPLITTERS = 14; // 两个分割条宽度
    const startX = e.clientX;
    const startW = type === 'left' ? leftW : rightW;
    // 本列最大宽度 = 容器 - splitters - 另一列 - 中列保底
    const otherW = type === 'left' ? rightW : leftW;
    const myMax = Math.max(MIN_W, containerW - SPLITTERS - otherW - CENTER_MIN);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const raw = type === 'left' ? startW + delta : startW - delta;
      const next = Math.max(MIN_W, Math.min(myMax, raw));
      if (type === 'left') setLeftW(Math.round(next));
      else setRightW(Math.round(next));
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftW, rightW]);

  // 监听 editorCode 变化
  useEffect(() => {
    const handler = (e) => {
      if (typeof e.detail?.code === 'string') setEditorCode(e.detail.code);
    };
    window.addEventListener('gis-apply-code', handler);
    return () => window.removeEventListener('gis-apply-code', handler);
  }, []);

  // 加载可用 AI 平台列表（当前会话里配了 Key 的平台；纯 session，不读服务端 DB）
  useEffect(() => {
    const refresh = () => {
      setAiPlatforms(
        sessionKeys.getAll().map((k) => ({ platform: k.platform, label: k.platform })),
      );
    };
    refresh();
    window.addEventListener('ai-keys-changed', refresh);
    return () => window.removeEventListener('ai-keys-changed', refresh);
  }, []);

  // 持久化选中平台
  useEffect(() => {
    try {
      if (aiCurrentPlatform) localStorage.setItem('ai-platform', aiCurrentPlatform);
      else localStorage.removeItem('ai-platform');
    } catch (_) {}
  }, [aiCurrentPlatform]);

  // 卸载清理
  useEffect(() => {
    return () => {
      try { aiXhrRef.current && aiXhrRef.current.abort(); } catch (_) {}
      aiXhrRef.current = null;
      aiAbortRef.current = null;
    };
  }, []);

  function pushToast(text, level = 'info', ttlMs = 3500) {
    const id = ++toastIdRef.current;
    setToasts((arr) => [...arr, { id, text, level }]);
    setTimeout(() => {
      setToasts((arr) => arr.filter((t) => t.id !== id));
    }, ttlMs);
  }

  function captureCtx() {
    const v = cesiumRef.current?.getViewer?.();
    if (!v) return;
    const editorAdapter = cesiumRef.current?.getEditorEntitiesAdapter?.();
    const editorApi = editorRef.current || null;
    // 沙箱里的 viewer.entities 走适配器：AI / 用户写的 viewer.entities.add(...) 自动落进编辑器桶
    // 其他属性（camera / scene / dataSources / ...）透传到真实 viewer
    const sandboxViewer = new Proxy(v, {
      get(target, prop) {
        if (prop === 'entities') return editorAdapter;
        return target[prop];
      },
    });
    ctxRef.current = {
      viewer: sandboxViewer,
      Cesium,
      scene: v.scene,
      // 适配器：把 entities.add 写入编辑器桶，让沙箱代码也能被 LayersTree 识别
      entities: editorAdapter,
      viewerEntities: v.entities,
      canvas: v.canvas,
      // 把 editorRef 也塞进 ctx，CodeEditor 可以拿它做"期望比对"
      editorApi: editorRef.current,
      // 编辑器命令式 API（programmaticDraw / createLayer / setSelection / ...）
      editor: editorApi,
    };
    // toast 只在组件生命周期里弹一次（captureCtx 会被 onInfo 多次触发）
    if (!sandboxToastShownRef.current) {
      pushToast('沙箱已就绪：可在编辑器写代码或让 AI 生成', 'success', 4000);
      sandboxToastShownRef.current = true;
    }
    // 阶段 2C: URL 里如有 view state,在 viewer ready 后应用一次
    if (pendingViewStateRef.current) {
      const v = pendingViewStateRef.current;
      pendingViewStateRef.current = null;
      try {
        cesiumRef.current?.applyViewState?.(v);
        pushToast('🔗 已从分享链接恢复视图', 'success', 2500);
      } catch (e) {
        pushToast('⚠️ 视图状态恢复失败', 'error', 2500);
      }
    }
  }

  async function runSandboxCode(code) {
    if (!ctxRef.current) {
      captureCtx();
      if (!ctxRef.current) {
        return { ok: false, logs: [], error: { message: 'Viewer 尚未就绪' } };
      }
    }
    // 未传 code 时从 localStorage 取（让"选示例后自动 run"这种无参调用能拿到刚加载的代码）
    if (typeof code !== 'string') {
      try {
        code = localStorage.getItem('gis-editor-code') || '';
      } catch (_) { code = ''; }
    }
    if (!code) return { ok: false, logs: [], error: { message: '编辑器为空，先加载示例或写代码' } };
    const r = await executeCesiumCode(ctxRef.current, code);
    r.logs.forEach((l) => {
      window.dispatchEvent(new CustomEvent('gis-console-log', { detail: l }));
    });
    if (!r.ok) {
      pushToast(`❌ ${r.error.message}${r.error.line ? ` (line ~${r.error.line})` : ''}`, 'error', 4500);
      // 记录错误信息，供"🔧 让 AI 修代码"按钮使用
      setLastError({ message: r.error.message, line: r.error.line, ts: Date.now() });
      // 用户代码失败：自动恢复 OSM + 默认视角（防止 removeAll() 之后地球永久黑屏）
      try { cesiumRef.current?.resetScene?.(); } catch (_) {}
    } else {
      pushToast(`✓ 执行完成（${r.durationMs}ms）`, 'success', 1800);
      setLastError(null);
    }
    return r;
  }

  // 成功运行后清错
  function clearLastError() { setLastError(null); }

  function handleResetScene() {
    try {
      cesiumRef.current?.resetScene?.();
      pushToast('场景已重置', 'info', 1800);
    } catch (e) {
      pushToast('重置失败：' + e.message, 'error', 3000);
    }
  }

  function handleClearScene() {
    try {
      const counts = cesiumRef.current?.clearAll?.() || {};
      setLoadedFiles([]);
      const total =
        (counts.entities || 0) +
        (counts.dataSources || 0) +
        (counts.imageryLayers || 0);
      pushToast(
        total > 0
          ? `场景已清空（移除 ${total} 个对象）`
          : '场景已清空',
        'info',
        1800,
      );
    } catch (e) {
      pushToast('清空失败：' + e.message, 'error', 3000);
    }
  }

  useEffect(() => {
    const onReset = () => handleResetScene();
    const onClear = () => handleClearScene();
    window.addEventListener('gis-reset-scene', onReset);
    window.addEventListener('gis-clear-scene', onClear);
    return () => {
      window.removeEventListener('gis-reset-scene', onReset);
      window.removeEventListener('gis-clear-scene', onClear);
    };
  }, []);

  function handleConsoleLog(entry) {}

  function handleApplyCode(code) {
    setEditorCode(code);
    window.dispatchEvent(new CustomEvent('gis-apply-code', { detail: { code } }));
    pushToast('已应用到编辑器', 'success', 1800);
  }

  // 抓取当前 Cesium 场景快照，供 AI 上下文使用
  // 合并三个数据桶：viewer.entities / editor DataSource / FileLoader 拖入文件
  function captureSceneContext() {
    try {
      const viewer = cesiumRef.current?.getViewer?.();
      if (!viewer) return null;
      const editor = editorRef.current ? {
        layers: editorRef.current.getLayers?.() || [],
        features: editorRef.current.getFeatures?.() || [],
        selectedIds: editorRef.current.getSelectedIds?.() || new Set(),
      } : null;
      const fileStats = (() => {
        try { return cesiumRef.current?.getDataSourceStats?.() || []; }
        catch (_) { return []; }
      })();
      const ctx = buildSceneContext({ viewer, editor, fileStats });
      ctx.headline = headlineOf(ctx);
      ctx.markdown = formatSceneContext(ctx);
      return ctx;
    } catch (_) {
      return null;
    }
  }

  async function handleAiSend(text, systemPrompt, attachments = []) {
    if (aiStreaming) return;
    // 纯 session：只认当前会话里配的 Key（不读服务端 DB，刷新/关闭即清）
    const sessionKeyList = sessionKeys.getAll();
    if (!sessionKeyList.length) {
      setAiMessages((arr) => [
        ...arr,
        { role: 'user', content: text, id: Date.now() },
        { role: 'assistant', content: '⚠️ 请先点击右上角 🔑 配置至少一个 AI 平台的 API Key 才能使用 GIS AI 助手（Key 仅存于本会话，刷新/关闭即清）。', id: Date.now() + 1 },
      ]);
      return;
    }
    // 用户选择的平台优先；否则用第一个配了 key 的平台
    let platform = sessionKeyList[0]?.platform;
    if (aiCurrentPlatform && sessionKeyList.some((k) => k.platform === aiCurrentPlatform)) {
      platform = aiCurrentPlatform;
    }
    if (!platform) {
      setAiMessages((arr) => [
        ...arr,
        { role: 'user', content: text, id: Date.now() },
        { role: 'assistant', content: '⚠️ 当前没有可用的 AI Key，请点击右上角 🔑 配置。', id: Date.now() + 1 },
      ]);
      return;
    }
    const localKey = sessionKeys.get(platform);
    // 把当前场景快照和最近错误塞进 system prompt
    const scene = captureSceneContext();
    const err = lastError;
    const ctxBlock = [
      '',
      '## 当前 Cesium 场景快照（你必须基于这些信息判断）',
      scene?.markdown || '- viewer 未就绪',
      err ? `- ⚠️ 最近一次 Run 报错：\`${err.message}\`${err.line ? `（line ~${err.line}）` : ''}` : '- 最近一次 Run：无错误',
      '',
      '## 行为约束（务必遵守）',
      '1. **工具优先**：能调读工具（list_layers / describe_layer / query_features / get_selection / list_files）就不要凭想象答；能调写工具（draw_feature / fly_to / set_attr / delete_features / move_features / create_layer / select_features）就走工具，不要让用户手动操作',
      '2. **严禁捏造 UI**：只引用项目里真实存在的 UI（FileLoader 图标 / 编辑器工具栏 / LayersTree / 属性表 / AI 确认弹窗）。如果不确定 UI 长什么样，就说「你需要点 X」+ 描述位置，别编按钮名',
      '3. 修复错误时**先看错误信息和场景快照**，定位后再写代码',
      '4. 严禁输出 HTML/CSS；只能写调用 viewer/Cesium/scene/entities/canvas 的纯 JS',
      '5. 涉及删除/清空操作时，必须先告诉用户会删哪些实体',
      '6. 代码块前先用 1 行中文简述意图，再贴代码',
      '',
      toolDocsForPrompt(),
    ].filter(Boolean).join('\n');
    const finalPrompt = (systemPrompt || '') + ctxBlock;
    setAiStreaming(true);

    const trimmedEditor = (editorCode || '').trim();
    const editorContext = trimmedEditor
      ? `\n\n## 用户当前编辑器内容\n\`\`\`js\n${trimmedEditor.slice(0, 4000)}\n\`\`\``
      : '';

    const citiesLine = `\n可用预设城市：${PRESETS.map((p) => `${p.name}(${p.lat.toFixed(2)},${p.lon.toFixed(2)})`).join(' / ')}`;

    // 起始消息历史：system + 最近 6 条既有对话
    const baseMessages = [
      { role: 'system', content: finalPrompt + citiesLine + editorContext },
      ...aiMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    ];

    // AbortController 给 aiAgent.js 用；老的 aiAbortRef/aiXhrRef 不再使用，
    // 但保留 handleStop 兼容旧的「停止」按钮
    const ctrl = new AbortController();
    aiAbortRef.current = { abort: () => ctrl.abort() };
    aiXhrRef.current = null;

    try {
      await runAgentLoop({
        messages: baseMessages,
        newUserText: text,
        platform,
        sessionId: aiSessionId,
        tempApiKey: localKey.apiKey,
        tempBaseUrl: localKey.baseUrl || undefined,
        tempModel: localKey.modelName || undefined,
        deps: {
          setMessages: setAiMessages,
          signal: ctrl.signal,
          getViewer: () => cesiumRef.current?.getViewer?.(),
          getCesium: () => cesiumRef.current,
          // 完整 editor 命令式 API（不再只是 4 个 getter）：
          // createLayer / assignFeaturesToLayer / deleteFeatures / setAttributes /
          // setSelection / flyToFeatures / programmaticDraw / ...
          getEditor: () => editorRef.current,
          getFileStats: () => cesiumRef.current?.getDataSourceStats?.() || [],
          getPresets: () => PRESETS,
          confirmWrite,
          // 3A：每次 model call 完成后，服务端会回 usage 事件；
          // 这里转发成 ai-usage window event，UsagePanel 监听即可即时刷新
          onUsage: (rec) => {
            try {
              window.dispatchEvent(new CustomEvent('ai-usage', { detail: rec }));
            } catch (_) {}
          },
        },
      });
    } catch (e) {
      setAiMessages((arr) => [...arr, { role: 'assistant', content: `\n\n❌ ${e.message}`, id: Date.now() }]);
    } finally {
      setAiStreaming(false);
      aiAbortRef.current = null;
    }
  }

  function handleStop() {
    if (aiAbortRef.current) aiAbortRef.current.abort();
    else if (aiXhrRef.current) {
      try { aiXhrRef.current.abort(); } catch (_) {}
      setAiStreaming(false);
      aiXhrRef.current = null;
      aiAbortRef.current = null;
    }
    // 强制把仍在流式标记的消息收尾（防止 UI 上 _streaming 卡死）
    setAiMessages((arr) => arr.map((m) => m._streaming ? { ...m, _streaming: false } : m));
  }

  const actualLeftW = leftCollapsed ? COLLAPSED_W : leftW;
  const actualRightW = rightCollapsed ? COLLAPSED_W : rightW;

  return (
    <div
      className={
        'gis-container'
        + (leftCollapsed ? ' left-collapsed' : '')
        + (rightCollapsed ? ' right-collapsed' : '')
      }
      ref={containerRef}
      style={{ '--left-w': actualLeftW + 'px', '--right-w': actualRightW + 'px' }}
    >
      {/* 阶段 3B：场景 AI 说明横幅（打开分享链接时显示） */}
      {aiSceneDesc && (
        <div className="ai-scene-desc-banner" role="region" aria-label="场景 AI 说明">
          <div className="ai-scene-desc-head">
            <span className="ai-scene-desc-icon" aria-hidden="true">🤖</span>
            <span className="ai-scene-desc-title">场景说明</span>
            {aiSceneDesc.model && (
              <span className="ai-scene-desc-model">by {aiSceneDesc.model}</span>
            )}
            <button
              type="button"
              className="ai-scene-desc-close"
              aria-label="关闭场景说明"
              onClick={() => setAiSceneDesc(null)}
            >✕</button>
          </div>
          <div className="ai-scene-desc-body">
            {aiSceneDesc.description.split('\n').map((line, i) => (
              <p key={i}>{line || '\u00a0'}</p>
            ))}
          </div>
        </div>
      )}

      {/* ===== 左列：代码编辑器 + 控制台 ===== */}
      <div
        className={'gis-col gis-col-left' + (leftCollapsed ? ' collapsed' : '')}
      >
        {leftCollapsed ? (
          <div className="col-collapse-bar" onClick={() => setLeftCollapsed(false)} title="展开代码编辑器">
            <span className="col-collapse-icon">{'<'}</span>
            <span className="col-collapse-label">代码</span>
          </div>
        ) : (
          <CodeEditor
            ctxRef={ctxRef}
            editorRef={editorRef}
            onApply={() => {}}
            onConsoleLog={handleConsoleLog}
            onCollapse={() => setLeftCollapsed(true)}
            // onAskAI / onSendLogToAI：CodeEditor 内部通过 window 'ai-set-input' 事件
            //   直接把 prompt 填到 AiSidePanel 输入框（不直接发送），用户可修改后再点"发送"
          />
        )}
      </div>

      {/* 垂直分割条 1（左|中）— 始终渲染；折叠时由 CSS 把该轨道收缩为 0 */}
      <div
        className="gis-hsplitter"
        onMouseDown={leftCollapsed ? undefined : startDrag('left')}
        title={leftCollapsed ? '' : '拖拽调节宽度'}
      />

      {/* ===== 中列：Cesium 地球 ===== */}
      <div className="gis-col gis-col-center">
        <div className="gis-scene">
          <CesiumEarth
            ref={cesiumRef}
            coordFormat={coordFormat}
            onCoordFormatChange={setCoordFormat}
            tdtTokenOverride={tdtTokenOverride}
            editorApiRef={editorRef}
            onInfo={(t) => {
              captureCtx();
              pushToast(t, 'info', 2200);
            }}
            onError={(err) => {
              pushToast('Cesium 初始化失败:' + err.message, 'error', 6000);
            }}
          />

          {/* 阶段 2C: 分享当前视图按钮(浮在右下角,避开 Cesium 自带控件) */}
          <button
            type="button"
            className="gis-share-view-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('gis-share-view'))}
            title="把当前地图视图打包成可分享 URL"
          >
            🔗 分享视图
          </button>

          {/* 天地图 Token 配置弹窗 */}
          {showTokenDialog && (
            <ImageryTokenDialog
              hasOverride={!!tdtTokenOverride}
              onSave={(token) => {
                // 仅在内存中暂存 override token（不会写入 localStorage / sessionStorage）
                // 服务端 token 走 /api/gis/tdt-token，本对话期内的 override 留在 React state
                setTdtTokenOverride(token);
                setShowTokenDialog(false);
                try { cesiumRef.current?.reloadImagery?.(); } catch (_) {}
              }}
              onSkip={() => {
                localStorage.setItem('cesium_tdt_skipped', '1');
                setShowTokenDialog(false);
              }}
            />
          )}

          <div className="toast-stack">
            {toasts.map((t) => (
              <div key={t.id} className={'toast toast-' + t.level}>
                {t.text}
              </div>
            ))}
          </div>

          {/* 文件上传面板（左下，避开 Cesium 自带控件） */}
          <FileLoader
            api={cesiumRef.current}
            loadedFiles={loadedFiles}
            onAdd={(f) => {
              setLoadedFiles((arr) => [...arr, f]);
              pushToast(`已加载 ${f.name}`, 'success', 1500);
            }}
            onRemove={(id) => {
              try { cesiumRef.current?.removeDataSource?.(id); } catch (_) {}
              setLoadedFiles((arr) => arr.filter((f) => f.id !== id));
              pushToast('已移除', 'info', 1200);
            }}
            onToggle={(id, willShow) => {
              try { cesiumRef.current?.toggleDataSource?.(id, willShow); } catch (_) {}
              setLoadedFiles((arr) => arr.map((f) => f.id === id ? { ...f, visible: willShow } : f));
            }}
            onZoom={(id) => {
              try { cesiumRef.current?.zoomToDataSource?.(id); } catch (_) {}
            }}
            onError={(msg) => pushToast(msg, 'error', 3500)}
          />

          {/* GIS 编辑器面板（点/线/面绘制、编辑、样式、保存下载）
              - ErrorBoundary 包一层：编辑器内部 render 抛错时只挂编辑器，
                不影响 Cesium 地球 / AI 助手 / 代码编辑器
          */}
          <ErrorBoundary fallback={EditorErrorFallback}>
            <EditorPanel
              ref={editorRef}
              cesiumRef={cesiumRef}
              coordFormat={coordFormat}
              onCoordFormatChange={setCoordFormat}
              onError={(msg) => pushToast(msg, 'error', 3500)}
              onInfo={(msg) => pushToast(msg, 'info', 1800)}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* 垂直分割条 2（中|右）— 始终渲染；折叠时由 CSS 把该轨道收缩为 0 */}
      <div
        className="gis-hsplitter"
        onMouseDown={rightCollapsed ? undefined : startDrag('right')}
        title={rightCollapsed ? '' : '拖拽调节宽度'}
      />

      {/* ===== 右列：AI 助手 ===== */}
      <div
        className={'gis-col gis-col-right' + (rightCollapsed ? ' collapsed' : '')}
      >
        {rightCollapsed ? (
          <div className="col-collapse-bar" onClick={() => setRightCollapsed(false)} title="展开 AI 助手">
            <span className="col-collapse-icon">{'>'}</span>
            <span className="col-collapse-label">AI</span>
          </div>
        ) : (
          <>
            <AiStatusBanner />
            <AiSidePanel
              messages={aiMessages}
              streaming={aiStreaming}
              onSend={handleAiSend}
              onStop={handleStop}
              onRunCode={runSandboxCode}
              onApplyCode={handleApplyCode}
              lastError={lastError}
              onClearError={clearLastError}
              onClearConversation={() => setAiMessages([])}
              sceneContext={sceneContext}
              aiPlatforms={aiPlatforms}
              currentPlatform={aiCurrentPlatform}
              onChangePlatform={setAiCurrentPlatform}
              onOpenKeySettings={() => setKeySettingsOpen(true)}
              onCollapse={() => setRightCollapsed(true)}
            />
          </>
        )}
      </div>

      {/* AI Key 设置（三页共享弹窗） */}
      <AiKeySettings open={keySettingsOpen} onClose={() => setKeySettingsOpen(false)} />

      {/* AI 写工具确认弹窗 */}
      {writeConfirm && (
        <WriteToolConfirmModal
          request={writeConfirm}
          onApprove={() => {
            const resolve = writeConfirmResolveRef.current;
            writeConfirmResolveRef.current = null;
            setWriteConfirm(null);
            resolve && resolve({ approved: true });
          }}
          onReject={() => {
            const resolve = writeConfirmResolveRef.current;
            writeConfirmResolveRef.current = null;
            setWriteConfirm(null);
            resolve && resolve({ approved: false });
          }}
        />
      )}
    </div>
  );
}
