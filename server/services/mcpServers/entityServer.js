// server/services/mcpServers/entityServer.js
// 周期 15 R5: Entity MCP Server
// 工具：addMarker / removeMarker / listMarkers / spatialQuery

'use strict';

const { createMcpServer } = require('./base');

/**
 * 创建 Entity MCP Server
 * @param {object} deps - { viewer, sandbox } Cesium Viewer + Sandbox 执行器
 * @returns {object} MCP server instance
 */
function createEntityServer(deps = {}) {
  const viewer = deps.viewer;
  const sandbox = deps.sandbox;

  const tools = [
    {
      name: 'addMarker',
      description: '在指定经纬度添加一个 marker（支持 id/label/color）',
      inputSchema: {
        type: 'object',
        properties: {
          longitude: { type: 'number', description: '经度' },
          latitude: { type: 'number', description: '纬度' },
          id: { type: 'string', description: 'marker ID（可选）' },
          label: { type: 'string', description: '标记标签' },
          color: { type: 'string', description: '颜色（hex）' },
        },
        required: ['longitude', 'latitude'],
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.addMarker !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.addMarker(args);
      },
    },
    {
      name: 'removeMarker',
      description: '移除指定 ID 的 marker',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'marker ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.removeMarker !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.removeMarker(args.id);
      },
    },
    {
      name: 'listMarkers',
      description: '列出所有已添加的 marker',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => {
        if (!viewer || typeof viewer.listMarkers !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.listMarkers();
      },
    },
    {
      name: 'spatialQuery',
      description: '空间查询（buffer/centroid/distance/area）',
      inputSchema: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['buffer', 'centroid', 'distance', 'area'] },
          args: { type: 'object', description: '操作参数' },
        },
        required: ['operation'],
      },
      handler: async (args) => {
        if (!sandbox || typeof sandbox.run !== 'function') {
          throw new Error('sandbox 未注入');
        }
        const op = args && args.operation;
        const opArgs = args && args.args ? JSON.stringify(args.args) : '{}';
        const toolStr = `<tool>${op}(${opArgs})</tool>`;
        return await sandbox.run(toolStr);
      },
    },
  ];

  return createMcpServer({
    name: 'cesium-entity',
    description: 'Cesium 实体/标记管理 MCP Server',
    version: '1.0.0',
    tools,
  });
}

module.exports = { createEntityServer };
