// NlQueryBar — 阶段 3 AI 智能体 · 自然语言查询 / 智能建议 / 报告导出
//
// 嵌入 AiSidePanel 顶部，承担 B+C+D 三块 UI：
//   - 🔮 自然语言输入：把中文句子编译成 QueryBuilder 规则（parseNlQuery）
//   - ✨ AI 建议：根据当前场景特征产出 3-5 条建议（buildSuggestions）
//   - 📝 报告导出：把场景打包成 MD/HTML 下载（exportSceneReport + downloadReport）
//
// 事件协议（与 QueryBuilder / AttributeTablePanel 衔接）：
//   - window 'nl-query-apply' event:
//       { detail: { query, bboxGroups? } }
//     QueryBuilder 监听 → 直接 setQuery(query) 并 bboxGroups 合并
//   - window 'nl-suggestion-apply' event:
//       { detail: { suggestion } }
//   - window 'nl-capture-snapshot' event:
//       { detail: { dataUrl } }
//     NlQueryBar 自己发请求 'gis-capture-for-report' → GIS index 监听后返回
//
// 离线/纯前端：所有逻辑都在本地执行，无外部依赖

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseNlQuery } from './editor/utils/nlQueryParser.js';
import { buildSuggestions, describeSuggestion, suggestionToQuery, KIND_META } from './editor/utils/aiSuggestions.js';
import { exportSceneReport, downloadReport } from './editor/utils/aiDocumentExporter.js';
import { suggestCesiumCode } from './editor/utils/nlCodeSuggester.js';

const QUICK_NL = [
  { label: '📍 name 含', text: 'name 含 北京' },
  { label: '📊 大于', text: '面积 大于 1000' },
  { label: '🕳 为空', text: '类型 为空' },
  { label: '🟦 bbox 内', text: '在 116,39,117,40 范围内' },
];

export default function NlQueryBar({ sceneContext, fields = [] }) {
  const [nlInput, setNlInput] = useState('');
  const [nlResult, setNlResult] = useState(null); // { query, hints, bboxGroups } | { error }
  const [showSuggest, setShowSuggest] = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [reportAiDesc, setReportAiDesc] = useState('');
  const [reportTitle, setReportTitle] = useState('GIS 场景报告');
  const inputRef = useRef(null);

  // 字段集合（合并内置 + 自定义）—— 同步自 sceneContext
  const mergedFields = useMemo(() => {
    const builtin = [
      { name: 'name', type: 'string', builtin: true, label: '名称' },
      { name: 'kind', type: 'string', builtin: true, label: '类型' },
      { name: 'layerId', type: 'string', builtin: true, label: '图层' },
    ];
    const fromCtx = (sceneContext?.layers || []).flatMap((l) => (l.fields || []).map((ff) => ({
      ...ff, label: ff.name, builtin: false,
    })));
    const seen = new Set();
    const out = [];
    for (const cand of [...builtin, ...fromCtx, ...fields]) {
      if (!cand || !cand.name) continue;
      if (seen.has(cand.name)) continue;
      seen.add(cand.name);
      out.push(cand);
    }
    return out;
  }, [sceneContext, fields]);

  const suggestions = useMemo(() => {
    if (!showSuggest) return [];
    return buildSuggestions(sceneContext, { limit: 5 });
  }, [sceneContext, showSuggest]);

  // 解析自然语言
  const handleNlParse = () => {
    const text = nlInput.trim();
    if (!text) {
      setNlResult({ error: '请输入查询语句' });
      return;
    }
    const result = parseNlQuery(text, mergedFields);
    if (!result || !result.query) {
      setNlResult({ error: result?.hints?.join('；') || '未能解析', input: text });
      return;
    }
    setNlResult({ ...result, input: text });
  };

  // 把解析结果应用到 QueryBuilder
  const handleNlApply = () => {
    if (!nlResult || !nlResult.query) return;
    const payload = suggestionToQuery({
      query: nlResult.query,
      bboxGroups: nlResult.bboxGroups,
    });
    window.dispatchEvent(new CustomEvent('nl-query-apply', { detail: payload }));
    setNlInput('');
    setNlResult(null);
  };

  // 一键应用某条建议
  const handleSuggestionClick = (s) => {
    const payload = suggestionToQuery(s);
    window.dispatchEvent(new CustomEvent('nl-suggestion-apply', { detail: payload }));
  };

  // 报告导出（需要先尝试抓截图）
  const handleReport = async (format) => {
    setShowReportMenu(false);
    let dataUrl = null;
    try {
      // 通过 window event 跟 GIS index 通信：派发请求 → 监听回调
      const capturePromise = new Promise((resolve) => {
        const handler = (e) => {
          window.removeEventListener('nl-capture-snapshot', handler);
          resolve(e.detail?.dataUrl || null);
        };
        window.addEventListener('nl-capture-snapshot', handler);
        window.dispatchEvent(new CustomEvent('nl-request-capture'));
        setTimeout(() => {
          window.removeEventListener('nl-capture-snapshot', handler);
          resolve(null);
        }, 3500);
      });
      dataUrl = await capturePromise;
    } catch (_) {}

    const report = exportSceneReport(sceneContext, {
      title: reportTitle,
      format,
      snapshotDataUrl: dataUrl,
      aiDescription: reportAiDesc || undefined,
    });
    if (report) downloadReport(report);
  };

  // 自然语言 → cesium 代码（NL→Code 入口）
  const handleNlCode = () => {
    const s = suggestCesiumCode(nlInput);
    if (!s.code) return;
    // 派发给代码编辑器：直接 setEditorCode + 应用（通过 gis-apply-code 事件）
    const block = `// ${s.plan}\n${s.code}`;
    window.dispatchEvent(new CustomEvent('gis-apply-code', { detail: { code: block } }));
    // 同时把 AI 输入框填上"先看草稿 → 让 AI 改进"的提示
    if (s.fallbackToAi) {
      window.dispatchEvent(new CustomEvent('ai-set-input', {
        detail: `（本地草稿未命中）原句：${nlInput}\n请按上面的理解帮我生成完整代码`,
      }));
    }
  };

  return (
    <div className="nl-bar">
      <div className="nl-bar-row">
        <span className="nl-bar-label">🔮 自然语言</span>
        <input
          ref={inputRef}
          className="input nl-bar-input"
          type="text"
          aria-label="自然语言过滤输入（例：name 含 北京 且 area 大于 1000）"
          value={nlInput}
          onChange={(e) => setNlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleNlParse();
          }}
          placeholder="例：name 含 北京 且 area 大于 1000"
          title="支持中文短语：含/是/大于/为空/bbox 范围；用「且」叠加，「或」切 OR 组"
        />
        <button className="btn small" onClick={handleNlParse} disabled={!nlInput.trim()}>
          解析
        </button>
        <button
          className="btn-link small"
          onClick={handleNlCode}
          disabled={!nlInput.trim()}
          title="把自然语言转成 cesium 代码片段（本地草稿引擎）"
        >
          ✨→代码
        </button>
      </div>

      {nlResult?.error && (
        <div className="nl-bar-chips">
          {QUICK_NL.map((c) => (
            <button key={c.label} className="ai-chip xsmall" onClick={() => { setNlInput(c.text); setNlResult(null); }}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {nlResult && (
        <div className={'nl-result ' + (nlResult.error ? 'nl-result-error' : 'nl-result-ok')}>
          {nlResult.error ? (
            <div>⚠️ {nlResult.error}</div>
          ) : (
            <>
              <div className="nl-result-summary">
                ✅ 解析出 <b>{nlResult.query.rules.length}</b> 条规则
                （{nlResult.query.combinator}）
                {nlResult.bboxGroups?.length ? ` + ${nlResult.bboxGroups.length} 个 bbox` : ''}
              </div>
              <div className="nl-result-rules">
                {nlResult.query.rules.map((r, i) => (
                  <div key={i} className="nl-result-rule">
                    <code>{r.field}</code> <span className="muted">{r.op}</span> <code>{JSON.stringify(r.value)}</code>
                  </div>
                ))}
              </div>
              {nlResult.hints && nlResult.hints.length > 0 && (
                <div className="nl-result-hints">
                  提示：{nlResult.hints.join('；')}
                </div>
              )}
              <div className="nl-result-actions">
                <button className="btn primary xsmall" onClick={handleNlApply}>
                  ↥ 应用到过滤器
                </button>
                <button className="btn-link xsmall" onClick={() => setNlResult(null)}>
                  清空
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="nl-bar-row nl-bar-secondary">
        <button
          className={'btn-link small' + (showSuggest ? ' active' : '')}
          onClick={() => setShowSuggest(!showSuggest)}
          disabled={!sceneContext}
          title="基于当前场景特征的智能过滤建议"
        >
          ✨ AI 建议 {suggestions.length ? `(${suggestions.length})` : ''}
        </button>
        <span className="muted small" style={{ flex: 1 }} />
        <div className="nl-bar-report" style={{ position: 'relative' }}>
          <button
            className={'btn-link small' + (showReportMenu ? ' active' : '')}
            onClick={() => setShowReportMenu(!showReportMenu)}
            disabled={!sceneContext}
            title="把当前场景打包成 Markdown / HTML 报告（含截图）"
          >
            📝 报告导出
          </button>
          {showReportMenu && (
            <div className="nl-report-menu" onMouseLeave={() => setShowReportMenu(false)}>
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="报告标题"
                className="input xsmall"
                aria-label="报告标题"
                style={{ width: '100%', marginBottom: 4 }}
              />
              <textarea
                value={reportAiDesc}
                onChange={(e) => setReportAiDesc(e.target.value)}
                placeholder="（可选）粘贴 AI 生成的场景说明"
                rows={2}
                className="input xsmall"
                aria-label="AI 场景说明（可选）"
                style={{ width: '100%', marginBottom: 4, resize: 'vertical' }}
              />
              <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                <button className="btn xsmall" onClick={() => handleReport('md')}>📄 MD</button>
                <button className="btn primary xsmall" onClick={() => handleReport('html')}>🌐 HTML</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showSuggest && suggestions.length > 0 && (
        <div className="nl-suggestions">
          {suggestions.map((s) => (
            <button
              key={s.id}
              className="nl-suggestion"
              onClick={() => handleSuggestionClick(s)}
              title={`点击应用：${s.reason || ''}`}
            >
              <span className="nl-suggestion-icon">{KIND_META[s.kind]?.icon || s.icon || '✨'}</span>
              <span className="nl-suggestion-text">
                <div className="nl-suggestion-label">{s.label}</div>
                {s.reason && <div className="nl-suggestion-reason muted small">{s.reason}</div>}
              </span>
            </button>
          ))}
        </div>
      )}
      {showSuggest && suggestions.length === 0 && (
        <div className="nl-suggestions nl-suggestions-empty">
          暂无建议（场景为空时不会有过滤建议）
        </div>
      )}
    </div>
  );
}
