// client/src/utils/sessionKeys.js
// 三页共享的会话级 AI Key store —— 纯内存，不落盘。
//
// 生命周期：
//   - SPA 路由切换（React Router 不重载页面）期间保留 → 博客首页 / AI 对话 / GIS 可视化共享
//   - 整页刷新（F5）/ 关闭标签 → JS 重载 → 内存清空 → key 自动清除（用户要求的行为）
//
// 数据结构：{ [platform]: { apiKey, baseUrl, modelName, remark, savedAt } }，每平台单 key
//
// 变更广播：
//   - window 'ai-keys-changed'（同标签，Home 已监听）
//   - localStorage 'ai-keys-changed-at'（跨标签；其他标签读到的是各自的空 store，行为正确）

const store = {};

function notify() {
  try {
    window.dispatchEvent(new CustomEvent("ai-keys-changed"));
  } catch (_) {}
  try {
    localStorage.setItem("ai-keys-changed-at", String(Date.now()));
  } catch (_) {}
}

export function getAll() {
  return Object.entries(store).map(([platform, creds]) => ({
    platform,
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl,
    modelName: creds.modelName,
    remark: creds.remark,
    savedAt: creds.savedAt,
  }));
}

export function get(platform) {
  const c = store[platform];
  return c ? { ...c, platform } : null;
}

export function set(platform, creds) {
  store[platform] = {
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl || "",
    modelName: creds.modelName || "",
    remark: creds.remark || "",
    savedAt: creds.savedAt || new Date().toLocaleTimeString(),
  };
  notify();
}

export function remove(platform) {
  if (!store[platform]) return;
  delete store[platform];
  notify();
}

export function clearAll() {
  for (const k of Object.keys(store)) delete store[k];
  notify();
}

export function hasAny() {
  return Object.keys(store).length > 0;
}

export function maskKey(apiKey) {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "****";
  return apiKey.slice(0, 4) + "****" + apiKey.slice(-4);
}
