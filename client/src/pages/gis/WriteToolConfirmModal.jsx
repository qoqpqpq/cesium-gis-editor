// WriteToolConfirmModal — AI 写工具确认弹窗
//
// 区别于 DiffModal（代码行 diff + 危险正则匹配）：
//   本弹窗专门描述"会修改哪些数据 / 多少要素 / 哪个图层"
//   人类可读、不用看代码
//
// 阶段 11 扩展：
//   - source 信息（platform / model / agentRound / usageCost）显示在底部
//   - 让用户在批准前知道"这次 AI 调用来自哪、已经花了多少 token"

import { useState } from 'react';

function formatCost(usage) {
  if (!usage) return null;
  const cost = usage.costUsd ?? usage.cost_usd;
  if (cost != null) return `$${Number(cost).toFixed(4)}`;
  const inT = usage.inputTokens ?? usage.prompt_tokens ?? 0;
  const outT = usage.outputTokens ?? usage.completion_tokens ?? 0;
  return `${(inT + outT).toLocaleString()} tokens`;
}

export default function WriteToolConfirmModal({ request, onApprove, onReject }) {
  if (!request) return null;
  const { name, args, describe, source } = request;
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    if (busy) return;
    setBusy(true);
    try { await onApprove?.(); } finally { setBusy(false); }
  };
  const handleReject = async () => {
    if (busy) return;
    setBusy(true);
    try { await onReject?.(); } finally { setBusy(false); }
  };

  const costText = formatCost(source?.usage);
  const hasSource = source && (source.platform || source.model || costText);

  return (
    <div className="write-tool-mask">
      <div className="write-tool-modal">
        <div className="write-tool-head">
          <span className="write-tool-icon">✍️</span>
          <span className="write-tool-title">AI 想修改场景</span>
          <code className="write-tool-name">{name}({args})</code>
        </div>
        <div className="write-tool-body">
          <div className="write-tool-section-title">{describe?.title || name}</div>
          {describe?.bullets?.length ? (
            <ul className="write-tool-bullets">
              {describe.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          ) : null}
          {describe?.warnings?.length ? (
            <ul className="write-tool-warnings">
              {describe.warnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}
            </ul>
          ) : null}
          {hasSource ? (
            <div className="write-tool-source muted small">
              来源：
              {source.platform ? <span className="src-chip">{source.platform}</span> : null}
              {source.model ? <span className="src-chip">{source.model}</span> : null}
              {source.agentRound != null ? (
                <span className="src-chip">第 {source.agentRound}/{source.maxRounds || 6} 轮</span>
              ) : null}
              {costText ? <span className="src-chip src-cost">{costText}</span> : null}
            </div>
          ) : null}
          <div className="write-tool-note muted small">
            所有 AI 写操作都可按 <kbd>Ctrl+Z</kbd> 撤销。
          </div>
        </div>
        <div className="write-tool-actions">
          <button className="btn" onClick={handleReject} disabled={busy}>拒绝</button>
          <button className="btn primary" onClick={handleApprove} disabled={busy}>批准</button>
        </div>
      </div>
    </div>
  );
}