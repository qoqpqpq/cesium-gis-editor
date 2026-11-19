// useGisPage.js — GIS 页面逻辑层自定义 hook（UR-2 步骤10）
// 自 index.jsx 整体搬迁：纯搬迁保行为，组件只留渲染 + 绑定解构。
import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { aiApi } from '../../api/index.js';
import { PRESETS } from './presets.js';
import { runAgentLoop } from './aiAgent.js';
import { toolDocsForPrompt } from './aiTools.js';
import { readViewStateFromUrl, buildShareUrl } from '../../utils/viewState.js';
import * as sessionKeys from '../../utils/sessionKeys.js';
import { usePanelLayout, COLLAPSED_W } from './usePanelLayout.js';
import { useAiState } from './useAiState.js';
import { useEditorState } from './useEditorState.js';
import { useGisCore } from './useGisCore.js';



export function useGisPage() {
  const cesiumRef = useRef(null);
  const editorRef = useRef(null);
  const ctxRef = useRef(null);
  const containerRef = useRef(null);
  const sandboxToastShownRef = useRef(false);

  // 三列面板布局（列宽/折叠/拖拽/resize/localStorage）已拆到 usePanelLayout 子钩子
  const {
    calcThird, leftW, setLeftW, rightW, setRightW,
    leftCollapsed, setLeftCollapsed, rightCollapsed, setRightCollapsed,
    startDrag,
  } = usePanelLayout(containerRef);

  // AI 会话/平台/确认弹窗状态已拆到 useAiState 子钩子
  const {
    aiMessages, setAiMessages,
    aiStreaming, setAiStreaming,
    aiAbortRef, aiXhrRef,
    writeConfirm, setWriteConfirm, writeConfirmResolveRef, confirmWrite,
    lastError, setLastError,
    aiPlatforms, setAiPlatforms,
    keySettingsOpen, setKeySettingsOpen,
    aiCurrentPlatform, setAiCurrentPlatform,
    aiSessionId,
  } = useAiState();

  // 编辑器/底图 Token/Toast/坐标格式状态已拆到 useEditorState 子钩子
  const {
    coordFormat, setCoordFormat,
    toasts, setToasts, toastIdRef, pushToast,
    editorCode, setEditorCode,
    loadedFiles, setLoadedFiles,
    showTokenDialog, setShowTokenDialog,
    tdtTokenOverride, setTdtTokenOverride,
    cesiumTokenOverride, setCesiumTokenOverride,
  } = useEditorState();

  // 视图

  // 阶段 2C: 启动时如果 URL 里有 view state,延迟到 viewer ready 后还原
  const pendingViewStateRef = useRef(null);
  useEffect(() => {
    const v = readViewStateFromUrl();
    if (v) pendingViewStateRef.current = v;
  }, []);

  // 核心执行/场景快照/重置清空已拆到 useGisCore 子钩子（依赖经对象注入）
  const {
    captureCtx, runSandboxCode, captureSceneContext,
    clearLastError, handleResetScene, handleClearScene,
    handleConsoleLog, handleApplyCode,
  } = useGisCore({
    cesiumRef, editorRef, ctxRef, pendingViewStateRef, sandboxToastShownRef,
    pushToast, setLastError, setLoadedFiles, setEditorCode,
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

  // 三列宽度 & 折叠状态逻辑已拆到 usePanelLayout 子钩子（见本钩子顶部调用）。
  // Test Suite 已删除

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

  return {
    cesiumRef,
    editorRef,
    ctxRef,
    containerRef,
    sandboxToastShownRef,
    coordFormat,
    setCoordFormat,
    toasts,
    setToasts,
    toastIdRef,
    aiMessages,
    setAiMessages,
    aiStreaming,
    setAiStreaming,
    aiAbortRef,
    aiXhrRef,
    pendingViewStateRef,
    writeConfirm,
    setWriteConfirm,
    writeConfirmResolveRef,
    confirmWrite,
    lastError,
    setLastError,
    aiPlatforms,
    setAiPlatforms,
    keySettingsOpen,
    setKeySettingsOpen,
    aiCurrentPlatform,
    setAiCurrentPlatform,
    aiSessionId,
    aiSceneDesc,
    setAiSceneDesc,
    editorCode,
    setEditorCode,
    loadedFiles,
    setLoadedFiles,
    sceneContext,
    setSceneContext,
    sceneContextRefreshRef,
    showTokenDialog,
    setShowTokenDialog,
    tdtTokenOverride,
    setTdtTokenOverride,
    cesiumTokenOverride,
    setCesiumTokenOverride,
    calcThird,
    leftW,
    setLeftW,
    rightW,
    setRightW,
    leftCollapsed,
    setLeftCollapsed,
    rightCollapsed,
    setRightCollapsed,
    startDrag,
    pushToast,
    captureCtx,
    runSandboxCode,
    clearLastError,
    handleResetScene,
    handleClearScene,
    handleConsoleLog,
    handleApplyCode,
    captureSceneContext,
    handleAiSend,
    handleStop,
    actualLeftW,
    actualRightW,
  };
}