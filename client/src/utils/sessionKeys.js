// client/src/utils/sessionKeys.js
// 三页共享的会话级 AI Key store —— 纯内存，不落盘。
//
// 生命周期：
//   - SPA 路由切换（React Router 不重载页面）期间保留 → 博客首页 / AI 对话 / GIS 可视化共享
//   - 整页刷新（F5）/ 关闭标签 → JS 重载 → 内存清空 → key 自动清除（用户要求的行为）
//
// 数据结构：{ [platform]: { apiKey, baseUrl, modelName, remark, savedAt } }，每平台单 key
//
// 周期 2 P1-7: 变更广播权威化为「同标签 dispatchEvent」
//   - 之前还往 localStorage 写 'ai-keys-changed-at' 让跨标签也能拿到，但
//     sessionKeys 是「标签内会话」语义——其他标签的 store 跟本标签是隔离的，
//     写 localStorage 既帮不上忙（跨标签 store 不共享），又会让其他标签
//     监听 storage 事件时误以为本标签状态有变。
//   - 现在：只在当前标签 dispatchEvent('ai-keys-changed')，依赖浏览器的
//     storage 默认隔离语义；跨标签就是独立的会话。

const store = {};

function notify() {
  // 周期 2 P1-7: 移除 localStorage 跨标签广播；只在当前标签 dispatchEvent
  try {
    window.dispatchEvent(new CustomEvent("ai-keys-changed"));
  } catch (_) {}
}

export function getAll(opts = {}) {
  const { withRemark = false } = opts;
  return Object.entries(store).map(([platform, creds]) => {
    const out = {
      platform,
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
      modelName: creds.modelName,
      savedAt: creds.savedAt,
    };
    // 周期 2 P2-7: remark 体积可能不小（用户笔记），默认不返；
    //   需要展示 remark 的调用方显式 withRemark: true
    if (withRemark) out.remark = creds.remark;
    return out;
  });
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
