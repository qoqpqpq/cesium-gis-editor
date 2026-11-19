// 周期141: useGisPage 拆分 (3/4) —— 核心执行/场景快照/重置清空子钩子
// 纯执行簇: captureCtx（沙箱 viewer 代理）/ runSandboxCode / captureSceneContext /
// clearLastError / handleResetScene / handleClearScene / handleConsoleLog / handleApplyCode,
// 以及 gis-reset-scene / gis-clear-scene 事件监听。
// 依赖经 deps 对象注入（9 项），不耦合 AI 编排。
import { useEffect } from 'react';
import * as Cesium from 'cesium';
import { executeCesiumCode } from './sandbox.js';
import { buildSceneContext, formatSceneContext, headlineOf } from './aiContext.js';

export function useGisCore({
  cesiumRef, editorRef, ctxRef, pendingViewStateRef, sandboxToastShownRef,
  pushToast, setLastError, setLoadedFiles, setEditorCode,
}) {
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

  return {
    captureCtx,
    runSandboxCode,
    captureSceneContext,
    clearLastError,
    handleResetScene,
    handleClearScene,
    handleConsoleLog,
    handleApplyCode,
  };
}