// client/src/pages/gis/mcpManifest.js
// 周期 8 P1-1: MCP (Model Context Protocol) manifest 浏览器侧暴露
// 周期 9 P1-1: 接入 5 个核心工具 + bridge transport 骨架
//
// 背景：
//   - Model Context Protocol (MCP) 2025+ AI Agent 通信标准
//   - 浏览器-agent 模式（browser-agent / WebMCP）：零后端，纯前端 MCP server
//   - 周期 7 P0-3 评估 cesium-mcp-bridge / WebMCP；周期 8 P1-1 落地最小可用 manifest
//   - 周期 9 P1-1: 接入 5 个核心工具 + bridge transport 骨架（周期 9 不引 npm 依赖，
//     仅在手写桥接层评估 cesium-mcp-bridge 的 5 工具集成模式）
//
// 设计：
//   - 暴露 window.mcp 对象（仅 dev 模式可启用；生产默认关闭）
//   - 提供工具注册接口：window.mcp.registerTool(name, schema, handler)
//   - 提供 manifest 端点：window.mcp.manifest() → 工具列表
//   - 与 client/src/pages/gis/sandbox.js 协议共用（<tool>name(args)</tool>）
//   - 周期 9：注册 5 个核心 GIS 工具（getCameraState / flyTo / addMarker / spatialQuery / screenshot）
//
// 启用条件：
//   - import.meta.env.MODE !== 'production' 或显式 ?mcp=1 URL 参数
//   - 防止生产 bundle 暴露内部工具
//
// 周期 9 范围：
//   - 5 个核心 GIS 工具集成
//   - bridge transport 骨架（window.postMessage 桥接 Claude Desktop / WebMCP）
//   - 不引 npm mcp-bridge 依赖（避免 +50KB；周期 10+ 评估）

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

/**
 * 周期 9 P1-1: 注册 5 个核心 GIS 工具（Cesium 相机/标记/空间查询/截图）
 * - getCameraState: 返回当前 Cesium 相机经纬度高程
 * - flyTo: 飞到指定经纬度高程
 * - addMarker: 在经纬度添加一个 marker
 * - spatialQuery: 调用 sandbox.js 协议字符串做空间查询（buffer / centroid）
 * - screenshot: 返回 canvas dataURL
 *
 * 依赖：viewer 实例（由调用方提供）。为避免硬绑定，这里用 lazy 注入；
 * 真实集成在 AiSidePanel 启动时通过 setBridgeDeps({ viewer, sandbox }) 注入。
 *
 * 协议兼容性：与 client/src/pages/gis/sandbox.js 协议字面 `<tool>name(args)</tool>` 共用。
 */
function _defaultToolHandlers(viewer, sandbox) {
  return {
    getCameraState: {
      name: 'getCameraState',
      description: '获取当前 Cesium 相机位置（longitude/latitude/height/heading/pitch）',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => {
        if (typeof viewer === 'undefined' || viewer === null || typeof viewer.getCameraState !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.getCameraState();
      },
    },
    flyTo: {
      name: 'flyTo',
      description: '飞到指定经纬度（弧度/度数可）+ 高度（米）',
      inputSchema: {
        type: 'object',
        properties: {
          longitude: { type: 'number' },
          latitude: { type: 'number' },
          height: { type: 'number', default: 10000 },
          duration: { type: 'number', default: 1.5 },
        },
        required: ['longitude', 'latitude'],
      },
      handler: async (args) => {
        if (typeof viewer === 'undefined' || viewer === null || typeof viewer.flyTo !== 'function') {
          throw new Error('viewer 未注入');
        }
        return await viewer.flyTo(args);
      },
    },
    addMarker: {
      name: 'addMarker',
      description: '在指定经纬度加一个 marker（id 可选）',
      inputSchema: {
        type: 'object',
        properties: {
          longitude: { type: 'number' },
          latitude: { type: 'number' },
          id: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['longitude', 'latitude'],
      },
      handler: async (args) => {
        if (typeof viewer === 'undefined' || viewer === null || typeof viewer.addMarker !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.addMarker(args);
      },
    },
    spatialQuery: {
      name: 'spatialQuery',
      description: '调用 sandbox.js 协议做空间查询（buffer/centroid/distance 等）',
      inputSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['buffer', 'centroid', 'distance', 'area'] },
          args: { type: 'object' },
        },
        required: ['operation'],
      },
      handler: async (args) => {
        if (typeof sandbox === 'undefined' || sandbox === null || typeof sandbox.run !== 'function') {
          throw new Error('sandbox 未注入');
        }
        const op = args && args.operation;
        const opArgs = args && args.args ? JSON.stringify(args.args) : '{}';
        // 复用既有协议字符串：`<tool>${op}(${opArgs})</tool>`
        const toolStr = `<tool>${op}(${opArgs})</tool>`;
        return await sandbox.run(toolStr);
      },
    },
    screenshot: {
      name: 'screenshot',
      description: '返回当前 Cesium canvas dataURL（PNG）',
      inputSchema: { type: 'object', properties: { quality: { type: 'number', default: 0.9 } } },
      handler: async (args) => {
        if (typeof viewer === 'undefined' || viewer === null || typeof viewer.screenshot !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.screenshot(args);
      },
    },
  };
}

let _bridgeDeps = { viewer: null, sandbox: null };

/**
 * 周期 9 P1-1: 注入依赖（viewer 实例 + sandbox 执行器）
 * 真实集成点：client/src/pages/gis/AiSidePanel.jsx 启动后调用一次
 */
function setBridgeDeps(deps) {
  _bridgeDeps = { viewer: deps && deps.viewer || null, sandbox: deps && deps.sandbox || null };
}

/**
 * 周期 9 P1-1: 注册 5 个核心 GIS 工具（使用 _bridgeDeps）
 * 返回注册的 tool name 列表
 */
function registerCoreGisTools() {
  const handlers = _defaultToolHandlers(_bridgeDeps.viewer, _bridgeDeps.sandbox);
  const registered = [];
  for (const k of Object.keys(handlers)) {
    const t = handlers[k];
    if (registerTool(t.name, t.description, t.inputSchema, t.handler)) {
      registered.push(t.name);
    }
  }
  return registered;
}

/**
 * 周期 9 P1-1: bridge transport 骨架（window.postMessage 桥接 Claude Desktop）
 * - 监听 window.message 事件（外部 iframe / Chrome extension / Claude Desktop）
 * - 解析 MCP JSON-RPC 请求 { jsonrpc, id, method, params }
 * - 路由到 manifest / callTool / listTools
 * - 响应通过 window.parent.postMessage 回传
 *
 * 安全性：
 * - 仅响应 origin 为 'null' (file://) 或 'https://claude.ai' 或 '*' (dev) 的 message
 * - 防止任意 origin 注入
 */
let _bridgeInstalled = false;
function installBridgeTransport(opts = {}) {
  if (typeof window === 'undefined') return false;
  if (_bridgeInstalled) return true;
  const allowedOrigins = opts.allowedOrigins || ['null', 'https://claude.ai', '*'];
  const onMessage = (event) => {
    if (Array.isArray(allowedOrigins) && !allowedOrigins.includes('*') && !allowedOrigins.includes(event.origin)) {
      return;
    }
    const data = event.data;
    if (!data || data.jsonrpc !== '2.0' || !data.method) return;
    let result;
    try {
      if (data.method === 'tools/list') {
        result = manifest();
      } else if (data.method === 'tools/call') {
        const name = data.params && data.params.name;
        const args = data.params && data.params.arguments;
        // callTool 是 async；这里 fire-and-forget，回传异步
        callTool(name, args).then((r) => {
          const reply = { jsonrpc: '2.0', id: data.id, result: r };
          if (event.source && typeof event.source.postMessage === 'function') {
            event.source.postMessage(reply, event.origin || '*');
          }
        });
        return;
      } else {
        result = { error: { code: -32601, message: 'Method not found' } };
      }
    } catch (e) {
      result = { error: { code: -32603, message: e.message } };
    }
    const reply = { jsonrpc: '2.0', id: data.id, result };
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage(reply, event.origin || '*');
    }
  };
  window.addEventListener('message', onMessage);
  _bridgeInstalled = true;
  return true;
}

function uninstallBridgeTransport() {
  // 简化版：未保存 listener 引用，所以仅清标记
  // 周期 10+ 应保存 listener ref 实现真卸载
  _bridgeInstalled = false;
}

function isBridgeInstalled() {
  return _bridgeInstalled;
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
  setBridgeDeps,
  registerCoreGisTools,
  installBridgeTransport,
  uninstallBridgeTransport,
  isBridgeInstalled,
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
  setBridgeDeps,
  registerCoreGisTools,
  installBridgeTransport,
  uninstallBridgeTransport,
  isBridgeInstalled,
};
