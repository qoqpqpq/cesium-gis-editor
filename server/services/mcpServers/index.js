// server/services/mcpServers/index.js
// 周期 15 R5: MCP Servers 统一导出

'use strict';

const { createMcpServer } = require('./base');
const { createCameraServer } = require('./cameraServer');
const { createEntityServer } = require('./entityServer');
const { createAnimationServer } = require('./animationServer');
const { createImageryServer } = require('./imageryServer');
const { createRegistry } = require('./registry');

module.exports = {
  createMcpServer,
  createCameraServer,
  createEntityServer,
  createAnimationServer,
  createImageryServer,
  createRegistry,
};
