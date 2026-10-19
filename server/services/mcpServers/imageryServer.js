// server/services/mcpServers/imageryServer.js
// 周期 15 R5: Imagery MCP Server
// 工具：addImageryLayer / removeImageryLayer / listImageryLayers / screenshot / setImageryStyle

'use strict';

const { createMcpServer } = require('./base');

/**
 * 创建 Imagery MCP Server
 * @param {object} deps - { viewer } Cesium Viewer 实例
 * @returns {object} MCP server instance
 */
function createImageryServer(deps = {}) {
  const viewer = deps.viewer;

  const tools = [
    {
      name: 'addImageryLayer',
      description: '添加底图图层（如 OSM/卫星/天地图）',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['osm', 'satellite', 'tdt', 'bing', 'carto'],
            description: '底图类型',
          },
          id: { type: 'string', description: '图层 ID' },
          opacity: { type: 'number', default: 1, description: '不透明度（0-1）' },
          visible: { type: 'boolean', default: true, description: '是否可见' },
        },
        required: ['type'],
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.addImageryLayer !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.addImageryLayer(args);
      },
    },
    {
      name: 'removeImageryLayer',
      description: '移除指定 ID 的底图图层',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '图层 ID' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.removeImageryLayer !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.removeImageryLayer(args.id);
      },
    },
    {
      name: 'listImageryLayers',
      description: '列出所有底图图层',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => {
        if (!viewer || typeof viewer.listImageryLayers !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.listImageryLayers();
      },
    },
    {
      name: 'screenshot',
      description: '截取当前 Cesium 画面（返回 PNG dataURL）',
      inputSchema: {
        type: 'object',
        properties: {
          quality: { type: 'number', default: 0.9, description: 'PNG 质量（0-1）' },
        },
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.screenshot !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.screenshot(args);
      },
    },
    {
      name: 'setImageryStyle',
      description: '设置底图样式（如暗色/亮色/地形）',
      inputSchema: {
        type: 'object',
        properties: {
          style: {
            type: 'string',
            enum: ['dark', 'light', 'terrain', 'hybrid'],
            description: '样式名称',
          },
        },
        required: ['style'],
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.setImageryStyle !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.setImageryStyle(args.style);
      },
    },
  ];

  return createMcpServer({
    name: 'cesium-imagery',
    description: 'Cesium 底图/影像图层 MCP Server',
    version: '1.0.0',
    tools,
  });
}

module.exports = { createImageryServer };
