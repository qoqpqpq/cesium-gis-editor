// server/services/mcpServers/cameraServer.js
// 周期 15 R5: Camera MCP Server
// 工具：getCameraState / flyTo / getCameraHeading / setCameraMode

'use strict';

const { createMcpServer } = require('./base');

/**
 * 创建 Camera MCP Server
 * @param {object} deps - { viewer } Cesium Viewer 实例
 * @returns {object} MCP server instance
 */
function createCameraServer(deps = {}) {
  const viewer = deps.viewer;

  const tools = [
    {
      name: 'getCameraState',
      description: '获取当前 Cesium 相机位置（longitude/latitude/height/heading/pitch）',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => {
        if (!viewer || typeof viewer.getCameraState !== 'function') {
          throw new Error('viewer 未注入');
        }
        return viewer.getCameraState();
      },
    },
    {
      name: 'flyTo',
      description: '飞到指定经纬度 + 高度（米），带平滑动画',
      inputSchema: {
        type: 'object',
        properties: {
          longitude: { type: 'number', description: '经度（弧度）' },
          latitude: { type: 'number', description: '纬度（弧度）' },
          height: { type: 'number', default: 10000, description: '高度（米）' },
          duration: { type: 'number', default: 1.5, description: '动画时长（秒）' },
        },
        required: ['longitude', 'latitude'],
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.flyTo !== 'function') {
          throw new Error('viewer 未注入');
        }
        return await viewer.flyTo(args);
      },
    },
    {
      name: 'getCameraHeading',
      description: '获取相机当前航向角（弧度）',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => {
        if (!viewer || typeof viewer.camera !== 'object') {
          throw new Error('viewer 未注入');
        }
        return {
          heading: viewer.camera.heading,
          pitch: viewer.camera.pitch,
          roll: viewer.camera.roll,
        };
      },
    },
    {
      name: 'setCameraMode',
      description: '设置相机交互模式（free/orbit/freeLook）',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['free', 'orbit', 'freeLook'] },
        },
        required: ['mode'],
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.camera !== 'object') {
          throw new Error('viewer 未注入');
        }
        // 模拟设置相机模式
        return { ok: true, mode: args.mode };
      },
    },
  ];

  return createMcpServer({
    name: 'cesium-camera',
    description: 'Cesium 相机控制 MCP Server',
    version: '1.0.0',
    tools,
  });
}

module.exports = { createCameraServer };
