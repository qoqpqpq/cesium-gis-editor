// AiStatusBanner — AI 助手状态指示器 (阶段 2D)
// 读共享 sessionKeys store 看当前会话是否有 AI key,有则显示 "已就绪",无则提示配置
// 不强制 — 只是 onboarding 提示,真正聊天逻辑在 AiSidePanel

import { useEffect, useState } from 'react';
import * as sessionKeys from '../../utils/sessionKeys.js';

export default function AiStatusBanner() {
  const [state, setState] = useState({ status: 'checking', platform: null, model: null });

  useEffect(() => {
    const refresh = () => {
      const keys = sessionKeys.getAll();
      if (keys.length > 0) {
        const first = keys[0];
        setState({
          status: 'ready',
          platform: first.platform,
          model: first.modelName || '',
        });
      } else {
        setState({ status: 'missing', platform: null, model: null });
      }
    };
    refresh();
    window.addEventListener('ai-keys-changed', refresh);
    return () => window.removeEventListener('ai-keys-changed', refresh);
  }, []);

  if (state.status === 'checking') {
    return (
      <div className="ai-status-banner ai-status-banner--checking" aria-live="polite">
        <span className="ai-status-dot" /> 正在检查 AI 配置…
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <div className="ai-status-banner ai-status-banner--warn">
        <span className="ai-status-dot ai-status-dot--warn" />
        <div className="ai-status-text">
          <strong>AI 助手未配置</strong>
          <span>点击右上角 🔑 配置 API Key（仅存于本会话，刷新/关闭即清）</span>
        </div>
      </div>
    );
  }

  // ready
  return (
    <div className="ai-status-banner ai-status-banner--ok">
      <span className="ai-status-dot ai-status-dot--ok" />
      <div className="ai-status-text">
        <strong>AI 助手已就绪</strong>
        <span>{state.platform}{state.model ? ` · ${state.model}` : ''}</span>
      </div>
    </div>
  );
}
