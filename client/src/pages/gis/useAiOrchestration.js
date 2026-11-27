// 周期142: useGisPage 拆分 (4/4) —— AI 编排胶水子钩子
// 周期324: useAiOrchestration 再拆分 (1/1) —— 拆成 4 个子钩子 + 薄组合根（本文件）
// 场景摘要 2s 轮询 + e2e window 钩子 + 分享代码自动运行 + 分享视图 AI 说明生成 +
// 截图联动 + handleAiSend（Agent 工具循环）/ handleStop。
// 依赖经对象注入（refs + 编辑器状态 + AI 状态 + useGisCore 执行器），verbatim 搬迁保行为。
// 本轮再拆：useAiSceneContext / useAiShareEvents / useAiScreenshot / useAiAgentSend，
// 本文件只做依赖分发与聚合，公共 API 保持不变。
import { useAiSceneContext } from './useAiSceneContext.js';
import { useAiShareEvents } from './useAiShareEvents.js';
import { useAiScreenshot } from './useAiScreenshot.js';
import { useAiAgentSend } from './useAiAgentSend.js';

export function useAiOrchestration({
  cesiumRef, editorRef, ctxRef,
  pushToast, editorCode,
  aiMessages, setAiMessages, aiStreaming, setAiStreaming, aiAbortRef, aiXhrRef,
  aiCurrentPlatform, aiPlatforms, aiSessionId, lastError, confirmWrite,
  runSandboxCode, captureSceneContext,
}) {
  // 场景上下文簇（2s 轮询 + e2e window 测试钩子）
  const { sceneContext, setSceneContext, sceneContextRefreshRef } = useAiSceneContext({
    cesiumRef, editorRef, runSandboxCode, captureSceneContext,
  });

  // 分享簇（?code= 自动执行 / gis-share-code / gis-share-view AI 说明 / gis-run-code）
  useAiShareEvents({
    cesiumRef, ctxRef, pushToast, editorCode,
    aiCurrentPlatform, aiPlatforms, aiSessionId, sceneContext,
    runSandboxCode,
  });

  // 截图簇（gis-screenshot / nl-request-capture）
  useAiScreenshot({ cesiumRef, pushToast });

  // Agent 发送簇（handleAiSend / handleStop）
  const { handleAiSend, handleStop } = useAiAgentSend({
    aiMessages, setAiMessages, aiStreaming, setAiStreaming, aiAbortRef, aiXhrRef,
    aiCurrentPlatform, aiSessionId, lastError, editorCode, confirmWrite,
    captureSceneContext, cesiumRef, editorRef,
  });

  // 三列宽度 & 折叠状态逻辑已拆到 usePanelLayout 子钩子（见本钩子顶部调用）。
  // Test Suite 已删除

  return {
    sceneContext,
    setSceneContext,
    sceneContextRefreshRef,
    handleAiSend,
    handleStop,
  };
}
