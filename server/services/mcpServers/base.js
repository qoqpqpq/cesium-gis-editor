// server/services/mcpServers/base.js
// 周期 15 R5: MCP Server 基类
// 提供统一的 MCP server 抽象（tools 注册、manifest、callTool）

'use strict';

/**
 * 创建 MCP Server 实例
 * @param {object} opts
 * @param {string} opts.name - server 名称
 * @param {string} opts.description - server 描述
 * @param {string} [opts.version='1.0.0'] - server 版本
 * @param {string} [opts.protocolVersion='2025-06-18'] - MCP 协议版本
 * @param {Array<object>} opts.tools - 工具列表 [{name, description, inputSchema, handler}]
 * @returns {object} server instance
 */
function createMcpServer(opts = {}) {
  const name = opts.name || 'unknown';
  const description = opts.description || '';
  const version = opts.version || '1.0.0';
  const protocolVersion = opts.protocolVersion || '2025-06-18';
  const tools = new Map();

  for (const t of (opts.tools || [])) {
    if (t.name) tools.set(t.name, t);
  }

  return {
    name,
    description,
    version,
    protocolVersion,

    /**
     * 获取 manifest（MCP 协议格式）
     */
    manifest() {
      const toolList = [];
      for (const t of tools.values()) {
        toolList.push({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        });
      }
      return {
        protocolVersion,
        serverInfo: { name, version },
        capabilities: { tools: { listChanged: false } },
        tools: toolList,
      };
    },

    /**
     * 注册工具
     */
    registerTool(name, description, inputSchema, handler) {
      if (!name || typeof name !== 'string') return false;
      tools.set(name, { name, description, inputSchema, handler });
      return true;
    },

    /**
     * 注销工具
     */
    unregisterTool(name) {
      return tools.delete(name);
    },

    /**
     * 调用工具
     */
    async callTool(name, args) {
      const t = tools.get(name);
      if (!t) return { ok: false, error: `工具 ${name} 不存在` };
      try {
        const value = await t.handler(args || {});
        return { ok: true, value };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    },

    /**
     * 列出工具名
     */
    listTools() {
      return Array.from(tools.keys());
    },

    /**
     * 工具数量
     */
    toolCount() {
      return tools.size;
    },
  };
}

module.exports = { createMcpServer };
