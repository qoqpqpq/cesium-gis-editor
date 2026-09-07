// server/agent/protocol/parse.js
// AI agent 的工具调用协议：<tool>name(args)</tool>（周期 6 P2-4 / P2-6）
//
// 这个协议源于 client/src/pages/gis/aiAgent.js + sandbox.js。本文件是
// Node 端（server/agent/）的 CommonJS 副本，与浏览器侧保持字面一致。
// 周期 6 P2-4: 协议字面 + 解析已抽到 ./index.js；本文件 re-export
//   保留向后兼容（老 import { parseToolTags } from '../protocol/parse' 仍可用）
// 周期 6 P2-6: 同时支持 OpenAI tool_calls[] 格式
//
// 设计要点：
// - args 内不能含 ')' / '/' / '{' （sandbox 沙箱规则，对应 aiAgent.js:parseToolTags 的正则）
// - 流式未闭合时返回 pending（让 caller 决定要不要等）
// - 流式已完成部分也可能含 pending + 已完成 tools 的混合

const { parseToolTags, parseArgs, TOOL_RE, TOOL_OPEN, TOOL_CLOSE } = require('./index');

module.exports = { parseToolTags, parseArgs, TOOL_RE, TOOL_OPEN, TOOL_CLOSE };