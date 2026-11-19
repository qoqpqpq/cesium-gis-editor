// 周期139: useGisPage 拆分 (2/4) —— AI 会话/平台/确认弹窗状态子钩子
// 纯状态簇: aiMessages / aiStreaming / abort-xhr refs / writeConfirm(promise) /
// lastError / aiPlatforms / keySettingsOpen / aiCurrentPlatform / aiSessionId,
// 以及关联的 window 事件监听与 localStorage 持久化。零业务耦合。
import { useEffect, useRef, useState, useCallback } from 'react';
import * as sessionKeys from '../../utils/sessionKeys.js';

export function useAiState() {
  // AI 会话
  const [aiMessages, setAiMessages] = useState([]);
  const [aiStreaming, setAiStreaming] = useState(false);
  const aiAbortRef = useRef(null);
  const aiXhrRef = useRef(null);

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

  return {
    aiMessages, setAiMessages,
    aiStreaming, setAiStreaming,
    aiAbortRef, aiXhrRef,
    writeConfirm, setWriteConfirm, writeConfirmResolveRef, confirmWrite,
    lastError, setLastError,
    aiPlatforms, setAiPlatforms,
    keySettingsOpen, setKeySettingsOpen,
    aiCurrentPlatform, setAiCurrentPlatform,
    aiSessionId,
  };
}