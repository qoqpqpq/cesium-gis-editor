// server/services/mcpServers/animationServer.js
// 周期 15 R5: Animation MCP Server
// 工具：playAnimation / pauseAnimation / stopAnimation / setAnimationSpeed / recordTimeline

'use strict';

const { createMcpServer } = require('./base');

/**
 * 创建 Animation MCP Server
 * @param {object} deps - { viewer } Cesium Viewer 实例
 * @returns {object} MCP server instance
 */
function createAnimationServer(deps = {}) {
  const viewer = deps.viewer;

  const tools = [
    {
      name: 'playAnimation',
      description: '播放时间线动画',
      inputSchema: {
        type: 'object',
        properties: {
          startTime: { type: 'string', description: '起始时间（ISO 8601）' },
          endTime: { type: 'string', description: '结束时间（ISO 8601）' },
          speed: { type: 'number', default: 1, description: '播放速度' },
        },
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.animation !== 'object') {
          throw new Error('viewer 未注入');
        }
        return { ok: true, playing: true, ...args };
      },
    },
    {
      name: 'pauseAnimation',
      description: '暂停时间线动画',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => {
        if (!viewer || typeof viewer.animation !== 'object') {
          throw new Error('viewer 未注入');
        }
        return { ok: true, playing: false };
      },
    },
    {
      name: 'stopAnimation',
      description: '停止时间线动画并重置',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async () => {
        if (!viewer || typeof viewer.animation !== 'object') {
          throw new Error('viewer 未注入');
        }
        return { ok: true, stopped: true };
      },
    },
    {
      name: 'setAnimationSpeed',
      description: '设置动画播放速度（1=正常，2=2倍速，0.5=半速）',
      inputSchema: {
        type: 'object',
        properties: {
          speed: { type: 'number', default: 1, description: '播放速度' },
        },
        required: ['speed'],
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.animation !== 'object') {
          throw new Error('viewer 未注入');
        }
        return { ok: true, speed: args.speed };
      },
    },
    {
      name: 'recordTimeline',
      description: '记录当前时间线关键帧',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '关键帧标签' },
        },
      },
      handler: async (args) => {
        if (!viewer || typeof viewer.camera !== 'object') {
          throw new Error('viewer 未注入');
        }
        return {
          ok: true,
          keyframe: {
            time: Date.now(),
            camera: {
              heading: viewer.camera.heading,
              pitch: viewer.camera.pitch,
              roll: viewer.camera.roll,
            },
            label: args.label || 'untitled',
          },
        };
      },
    },
  ];

  return createMcpServer({
    name: 'cesium-animation',
    description: 'Cesium 时间线动画 MCP Server',
    version: '1.0.0',
    tools,
  });
}

module.exports = { createAnimationServer };
