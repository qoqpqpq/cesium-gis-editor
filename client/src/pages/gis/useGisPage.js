// useGisPage.js — GIS 页面逻辑层自定义 hook（UR-2 步骤10）
// 自 index.jsx 整体搬迁：纯搬迁保行为，组件只留渲染 + 绑定解构。
import { useEffect, useRef, useState } from 'react';
import { readViewStateFromUrl } from '../../utils/viewState.js';
import { usePanelLayout, COLLAPSED_W } from './usePanelLayout.js';
import { useAiState } from './useAiState.js';
import { useEditorState } from './useEditorState.js';
import { useGisCore } from './useGisCore.js';
import { useAiOrchestration } from './useAiOrchestration.js';

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

  // AI 编排胶水（场景摘要轮询/e2e 钩子/分享链接与 AI 说明/截图联动/Agent 发送与停止）
  // 已拆到 useAiOrchestration 子钩子（依赖经对象注入）
  const {
    sceneContext, setSceneContext, sceneContextRefreshRef,
    handleAiSend, handleStop,
  } = useAiOrchestration({
    cesiumRef, editorRef, ctxRef,
    pushToast, editorCode,
    aiMessages, setAiMessages, aiStreaming, setAiStreaming, aiAbortRef, aiXhrRef,
    aiCurrentPlatform, aiPlatforms, aiSessionId, lastError, confirmWrite,
    runSandboxCode, captureSceneContext,
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