// client/src/pages/gis/mcpManifest.js
// 周期 8 P1-1: MCP (Model Context Protocol) manifest 浏览器侧暴露
//
// 背景：
//   - Model Context Protocol (MCP) 2025+ AI Agent 通信标准
//   - 浏览器-agent 模式（browser-agent / WebMCP）：零后端，纯前端 MCP server
//   - 周期 7 P0-3 评估 cesium-mcp-bridge / WebMCP；周期 8 P1-1 落地最小可用 manifest
//
// 设计：
//   - 暴露 window.mcp 对象（仅 dev 模式可启用；生产默认关闭）
//   - 提供工具注册接口：window.mcp.registerTool(name, schema, handler)
//   - 提供 manifest 端点：window.mcp.manifest() → 工具列表
//   - 与 client/src/pages/gis/sandbox.js 协议共用（<tool>name(args)</tool>）
//
// 启用条件：
//   - import.meta.env.MODE !== 'production' 或显式 ?mcp=1 URL 参数
//   - 防止生产 bundle 暴露内部工具
//
// 周期 8 范围：
//   - manifest 数据结构 + 工具注册 API
//   - 不接真 Claude Desktop（周期 9+）
//   - 不实现 MCP transport 协议（仅 manifest + 工具描述）

/**
 * MCP 工具 schema（简化版；周期 8 用最小集）
 * @typedef {object} McpTool
 * @property {string} name - 工具名（与 sandbox.js 协议一致）
 * @property {string} description - 工具描述（供 LLM 理解）
 * @property {object} inputSchema - JSON Schema 描述输入参数
 * @property {Function} handler - 异步执行函数
 */

const _tools = new Map();

/**
 * 注册 MCP 工具
 * @param {string} name
 * @param {string} description
 * @param {object} inputSchema - JSON Schema
 * @param {Function} handler - async (args) => result
 */
function registerTool(name, description, inputSchema, handler) {
  if (!name || typeof name !== 'string') {
    console.warn('[mcp] registerTool: name 必须是非空字符串');
    return false;
  }
  if (_tools.has(name)) {
    console.warn(`[mcp] registerTool: 工具 ${name} 已存在，覆盖`);
  }
  _tools.set(name, { name, description, inputSchema, handler });
  return true;
}

/**
 * 注销 MCP 工具
 */
function unregisterTool(name) {
  return _tools.delete(name);
}

/**
 * 获取 manifest（MCP 协议要求：暴露工具列表）
 * @returns {{protocolVersion: string, serverInfo: object, capabilities: object, tools: Array<McpTool>}}
 */
function manifest() {
  const tools = [];
  for (const t of _tools.values()) {
    tools.push({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    });
  }
  return {
    protocolVersion: '2025-06-18', // MCP 当前 spec version
    serverInfo: {
      name: 'cesium-gis-editor',
      version: '1.0.0',
    },
    capabilities: {
      tools: { listChanged: false },
    },
    tools,
  };
}

/**
 * 调用工具（内部使用；外部 LLM 通过 transport 调用）
 * @param {string} name
 * @param {object} args
 * @returns {Promise<{ok: boolean, value?: any, error?: string}>}
 */
async function callTool(name, args) {
  const t = _tools.get(name);
  if (!t) return { ok: false, error: `工具 ${name} 不存在` };
  try {
    const value = await t.handler(args || {});
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * 列出已注册工具名
 */
function listTools() {
  return Array.from(_tools.keys());
}

/**
 * 浏览器侧暴露 window.mcp
 * - 仅在 dev 模式或显式 ?mcp=1 启用
 * - 防止生产 bundle 暴露内部工具
 */
function installBrowserGlobal() {
  if (typeof window === 'undefined') return false;
  // 启用条件：dev 模式 或 URL 含 ?mcp=1
  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE !== 'production';
  const urlParams = new URLSearchParams(window.location.search);
  const forceEnable = urlParams.get('mcp') === '1';
  if (!isDev && !forceEnable) return false;
  // 不覆盖已有 window.mcp（如已加载真 MCP SDK）
  if (window.mcp && window.mcp.__cesiumInstalled) return false;
  window.mcp = {
    __cesiumInstalled: true,
    manifest,
    registerTool,
    unregisterTool,
    callTool,
    listTools,
  };
  return true;
}

/**
 * 卸载（测试用）
 */
function uninstallBrowserGlobal() {
  if (typeof window === 'undefined') return;
  if (window.mcp && window.mcp.__cesiumInstalled) {
    delete window.mcp;
  }
}

/**
 * 清空所有注册（测试用）
 */
function _resetAll() {
  _tools.clear();
}

export {
  registerTool,
  unregisterTool,
  manifest,
  callTool,
  listTools,
  installBrowserGlobal,
  uninstallBrowserGlobal,
  _resetAll,
};
export default {
  registerTool,
  unregisterTool,
  manifest,
  callTool,
  listTools,
  installBrowserGlobal,
  uninstallBrowserGlobal,
  _resetAll,
};
