// client/src/components/AiKeySettings.jsx
// 三页共享的 AI Key 管理弹窗（博客首页 / AI 对话 / GIS 可视化都能打开）
// 内部只读写 sessionKeys（纯内存 store）—— 不调后端 saveKey，刷新/关闭即清。
import { useEffect, useState } from "react";
import { aiApi } from "../api/index.js";
import * as sessionKeys from "../utils/sessionKeys.js";

export default function AiKeySettings({ open, onClose }) {
  const [platforms, setPlatforms] = useState([]);
  const [keys, setKeys] = useState([]);
  const [activePlatform, setActivePlatform] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [remark, setRemark] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState("");

  const refreshKeys = () => setKeys(sessionKeys.getAll({ withRemark: true }));

  useEffect(() => {
    if (!open) return;
    aiApi.platforms().then((p) => {
      const list = Array.isArray(p) ? p : [];
      setPlatforms(list);
      // 默认选第一个还没配的平台；全配了就选第一个
      const firstFree = list.find((x) => !sessionKeys.get(x.key));
      const first = list[0];
      setActivePlatform((prev) => {
        const stillValid = prev && list.some((x) => x.key === prev);
        return stillValid ? prev : (firstFree?.key || first?.key || "");
      });
    }).catch(() => {});
    refreshKeys();
    const onKeys = () => refreshKeys();
    window.addEventListener("ai-keys-changed", onKeys);
    return () => window.removeEventListener("ai-keys-changed", onKeys);
  }, [open]);

  if (!open) return null;

  const current = keys.find((k) => k.platform === activePlatform);
  const currentPlatform = platforms.find((p) => p.key === activePlatform);

  const handleSave = (e) => {
    e.preventDefault();
    if (!activePlatform) {
      setError("请先选择平台");
      return;
    }
    if (!apiKey.trim()) {
      setError("请填写 API Key");
      return;
    }
    sessionKeys.set(activePlatform, {
      apiKey: apiKey.trim(),
      baseUrl: (baseUrl || currentPlatform?.baseUrl || "").trim(),
      modelName: (model || currentPlatform?.defaultModel || "").trim(),
      remark: remark.trim(),
    });
    setApiKey("");
    setBaseUrl("");
    setModel("");
    setRemark("");
    setError("");
  };

  const handleDelete = (platform) => {
    if (!confirm(`删除 ${platform} 的会话 Key？刷新或关闭浏览器后本就清除。`)) return;
    sessionKeys.remove(platform);
    if (activePlatform === platform) {
      setActivePlatform(platforms[0]?.key || "");
      setApiKey("");
    }
  };

  const handleClearAll = () => {
    if (!confirm("清除本浏览器会话里的所有 Key？")) return;
    sessionKeys.clearAll();
    setApiKey("");
  };

  const fillForm = (k) => {
    setActivePlatform(k.platform);
    setBaseUrl(k.baseUrl || "");
    setModel(k.modelName || "");
    setRemark(k.remark || "");
  };

  return (
    <div
      className="ai-modal-mask"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="AI Key 设置"
    >
      <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-head">
          <span>🔑 AI Key 设置</span>
          <button className="sandcastle-icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="ai-modal-body" style={{ padding: 16, overflow: "auto" }}>
          <div className="key-security-note">
            🔒 Key 仅存于本浏览器当前会话（内存），不写入服务器、不入库。
            刷新页面或关闭标签即清除。三个页面（博客 / AI 对话 / GIS）共享。
          </div>

          {keys.length > 0 && (
            <div className="configured-models" style={{ marginTop: 12 }}>
              <h4 className="muted small">已配置平台（{keys.length}）</h4>
              <div className="model-grid">
                {keys.map((k) => {
                  const p = platforms.find((x) => x.key === k.platform);
                  const isActive = k.platform === activePlatform;
                  return (
                    <button
                      key={k.platform}
                      className={"model-chip" + (isActive ? " active" : "")}
                      onClick={() => fillForm(k)}
                      title={"点击编辑 " + (p?.label || k.platform)}
                    >
                      <span className="model-name">{p?.label || k.platform}</span>
                      <span className="model-ver">{k.modelName || "默认"}</span>
                      {isActive && <span className="key-indicator">✓</span>}
                    </button>
                  );
                })}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <span className="muted small">{current ? sessionKeys.maskKey(current.apiKey) : ""}</span>
                {current && current.remark && (
                  <span className="muted small">· {current.remark}</span>
                )}
                <span className="muted small">· 已存 {current?.savedAt}</span>
                <button className="btn-link danger small" onClick={handleClearAll}>
                  清除全部
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSave} style={{ marginTop: 12 }}>
            <label htmlFor="aikey-platform">平台</label>
            <select
              id="aikey-platform"
              className="input"
              value={activePlatform}
              onChange={(e) => {
                setActivePlatform(e.target.value);
                setError("");
              }}
            >
              {platforms.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                  {keys.some((k) => k.platform === p.key) ? "（已配置）" : ""}
                </option>
              ))}
            </select>
            <label htmlFor="aikey-baseurl">Base URL（可选，留空用默认）</label>
            <input
              id="aikey-baseurl"
              className="input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://..."
              autoComplete="off"
            />
            <label htmlFor="aikey-model">模型名（可选，留空用默认）</label>
            <input
              id="aikey-model"
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例如 gpt-4o-mini"
              autoComplete="off"
            />
            <label htmlFor="aikey-key">API Key</label>
            <div className="key-input-row">
              <input
                id="aikey-key"
                className="input"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
              />
              <button
                type="button"
                className="btn-link small"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? "隐藏明文" : "显示明文"}
              >
                {showApiKey ? "🙈" : "👁"}
              </button>
            </div>
            <label htmlFor="aikey-remark">备注（可选）</label>
            <input
              id="aikey-remark"
              className="input"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="例如 个人账号"
            />
            <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: "space-between" }}>
              <button className="btn primary" type="submit">
                {current ? "替换该平台 Key" : "保存到本会话"}
              </button>
              {current && (
                <button
                  type="button"
                  className="btn-link danger small"
                  onClick={() => handleDelete(activePlatform)}
                >
                  删除 {currentPlatform?.label || activePlatform}
                </button>
              )}
            </div>
            {error && <div className="error-text" style={{ marginTop: 8 }}>❌ {error}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}
