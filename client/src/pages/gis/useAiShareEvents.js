// 周期324: useAiOrchestration 再拆分 (2/4) —— 分享簇子钩子
// `?code=` hash 自动执行（等 viewer 就绪 + CodeMirror 挂载后 run 一次）+
// `gis-share-code`（🔗 分享 toast 事件）+ `gis-share-view`（阶段 2C+3B，调
// /api/ai/scene-description 生成 markdown 说明嵌入 URL hash）+ `gis-run-code`（选示例后自动 run）。
// 纯副作用，无返回字段。依赖经对象注入。
import { useEffect } from 'react';
import { aiApi } from '../../api/index.js';
import { buildShareUrl } from '../../utils/viewState.js';
import * as sessionKeys from '../../utils/sessionKeys.js';

export function useAiShareEvents({
  cesiumRef, ctxRef, pushToast, editorCode,
  aiCurrentPlatform, aiPlatforms, aiSessionId, sceneContext,
  runSandboxCode,
}) {
  useEffect(() => {
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

    return () => {
      window.removeEventListener('gis-share-code', onShare);
      window.removeEventListener('gis-share-view', onShareView);
      window.removeEventListener('gis-run-code', onRunCode);
    };
  }, []);

  return {};
}
