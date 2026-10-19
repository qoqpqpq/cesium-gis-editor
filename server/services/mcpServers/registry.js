// server/services/mcpServers/registry.js
// 周期 15 R5: MCP Server 注册表
// 统一管理 4 个 MCP server（camera / entity / animation / imagery）

'use strict';

const { createCameraServer } = require('./cameraServer');
const { createEntityServer } = require('./entityServer');
const { createAnimationServer } = require('./animationServer');
const { createImageryServer } = require('./imageryServer');

/**
 * 创建 MCP Server 注册表
 * @param {object} deps - { viewer, sandbox } Cesium Viewer + Sandbox
 * @returns {object} registry instance
 */
function createRegistry(deps = {}) {
  const servers = new Map();

  // 注册 4 个默认 server
  servers.set('camera', createCameraServer(deps));
  servers.set('entity', createEntityServer(deps));
  servers.set('animation', createAnimationServer(deps));
  servers.set('imagery', createImageryServer(deps));

  return {
    /**
     * 获取指定 server
     */
    getServer(name) {
      return servers.get(name) || null;
    },

    /**
     * 注册自定义 server
     */
    registerServer(name, server) {
      if (!name || !server) return false;
      servers.set(name, server);
      return true;
    },

    /**
     * 注销 server
     */
    unregisterServer(name) {
      return servers.delete(name);
    },

    /**
     * 列出所有 server 名
     */
    listServers() {
      return Array.from(servers.keys());
    },

    /**
     * 获取所有 server 的 manifest（聚合）
     */
    allManifests() {
      const manifests = [];
      for (const [name, server] of servers) {
        manifests.push({
          name,
          ...server.manifest(),
        });
      }
      return manifests;
    },

    /**
     * 获取总工具数
     */
    totalToolCount() {
      let count = 0;
      for (const server of servers.values()) {
        count += server.toolCount();
      }
      return count;
    },

    /**
     * 调用指定 server 的工具
     */
    async callTool(serverName, toolName, args) {
      const server = servers.get(serverName);
      if (!server) {
        return { ok: false, error: `Server ${serverName} 不存在` };
      }
      return server.callTool(toolName, args);
    },

    /**
     * 服务器数量
     */
    serverCount() {
      return servers.size;
    },
  };
}

module.exports = { createRegistry };
