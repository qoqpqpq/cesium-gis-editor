// 周期324: useAiOrchestration 再拆分 (4/4) —— Agent 发送簇子钩子
// handleAiSend(text, systemPrompt, attachments)：Agent 工具循环（aiApi 平台路由 /
// runAgentLoop / toolDocsForPrompt / PRESETS / aiXhrRef / aiAbortRef）+ handleStop。
// 依赖经对象注入。
import { PRESETS } from './presets.js';
import { runAgentLoop } from './aiAgent.js';
import { toolDocsForPrompt } from './aiTools.js';
import * as sessionKeys from '../../utils/sessionKeys.js';

export function useAiAgentSend({
  aiMessages, setAiMessages, aiStreaming, setAiStreaming, aiAbortRef, aiXhrRef,
  aiCurrentPlatform, aiSessionId, lastError, editorCode, confirmWrite,
  captureSceneContext, cesiumRef, editorRef,
}) {

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

  return { handleAiSend, handleStop };
}
