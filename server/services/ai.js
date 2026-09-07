// 多平台大模型统一转发服务
// 支持：OpenAI、Anthropic Claude、Google Gemini、DeepSeek、Minimax、Moonshot、智谱、通义千问
// 独立开源版：无数据库，AI Key 纯会话（tempCreds），不落盘
// 周期 3 P0-1: SSRF 防护升级 —— IP 分类逻辑下沉到 ssrf-guard.js
//   仍保持本文件内 validateBaseUrl / validateBaseUrlWithDns / isPrivateIp / resolveBaseUrl 公共 API
//   （向后兼容）；实现改为 re-export 自 ssrf-guard
const fetch = require("node-fetch");
const dns = require("node:dns").promises;
const ssrfGuard = require("./ssrf-guard");

// ---- 用量计费（USD per 1M tokens） ----
// 数据来源：各家厂商公开页面（2026-08 报价；如官价改了更新这里即可，前端按 cost_usd 直接显示）
// cache_read / cache_write 单独定价的厂商填下面；没填则按 prompt 价（除 Anthropic 没有 cache 概念）
// 字段含义：inputPrice = prompt_tokens 价格（per 1M USD）
//   outputPrice = completion_tokens 价格
//   cacheReadPrice = cache 命中读取价格
//   cacheWritePrice = cache 写入价格
const PRICING = {
  openai: {
    // OpenAI 平台按 model 定价（默认 gpt-4o-mini；其他 model 价格另外加）
    'gpt-4o-mini':           { input: 0.15,   output: 0.60,   cacheRead: 0.075,  cacheWrite: 0.15 },
    'gpt-4o':                { input: 2.50,   output: 10.00,  cacheRead: 1.25,   cacheWrite: 2.50 },
    'gpt-4.1-mini':          { input: 0.40,   output: 1.60,   cacheRead: 0.10,   cacheWrite: 0.40 },
    'gpt-4.1':               { input: 2.00,   output: 8.00,   cacheRead: 0.50,   cacheWrite: 2.00 },
    'o1-mini':               { input: 1.10,   output: 4.40 },
    'o3-mini':               { input: 1.10,   output: 4.40,   cacheRead: 0.55 },
  },
  claude: {
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
    'claude-3-5-haiku-20241022':  { input: 0.80, output: 4.00,  cacheRead: 0.08, cacheWrite: 1.00 },
    'claude-3-opus-20240229':     { input: 15.00,output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
    'claude-sonnet-4-20250514':   { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  },
  gemini: {
    'gemini-1.5-flash':      { input: 0.075,  output: 0.30 },
    'gemini-1.5-pro':        { input: 1.25,   output: 5.00 },
    'gemini-2.0-flash':      { input: 0.10,   output: 0.40 },
    'gemini-2.5-pro':        { input: 1.25,   output: 10.00 },
  },
  deepseek: {
    'deepseek-chat':         { input: 0.14,   output: 0.28,   cacheRead: 0.014 }, // 命中缓存折扣
    'deepseek-reasoner':     { input: 0.55,   output: 2.19 },
  },
  minimax: {
    'MiniMax-M3':            { input: 0.20,   output: 0.60 },
    'MiniMax-Text-01':       { input: 0.20,   output: 0.60 },
    'abab6.5s-chat':         { input: 0.20,   output: 0.60 },
  },
  'minimax-anthropic': {
    // 同一个 MiniMax 后端，Anthropic 协议价位同 minimax
    'MiniMax-M3':            { input: 0.20,   output: 0.60 },
    'MiniMax-Text-01':       { input: 0.20,   output: 0.60 },
  },
  moonshot: {
    'moonshot-v1-8k':        { input: 1.00,   output: 1.00 },
    'moonshot-v1-32k':       { input: 2.00,   output: 2.00 },
    'moonshot-v1-128k':      { input: 6.00,   output: 6.00 },
    'moonshot-v1-auto':      { input: 2.00,   output: 2.00 },
  },
  zhipu: {
    'glm-4-flash':           { input: 0.10,   output: 0.10 },
    'glm-4-plus':            { input: 7.00,   output: 7.00 },
    'glm-4-air':             { input: 0.50,   output: 0.50 },
  },
  qwen: {
    'qwen-turbo':            { input: 0.30,   output: 0.60 },
    'qwen-plus':             { input: 2.00,   output: 6.00 },
    'qwen-max':              { input: 4.00,   output: 12.00 },
    'qwen-long':             { input: 0.40,   output: 1.00 },
  },
  ollama: {
    // 本地模型不收费；用 input=0 / output=0 表示
    '*':                     { input: 0,      output: 0 },
  },
};

// 模型名模糊匹配：厂商加新 model 时（如 gpt-4o-2024-08-06）我们默认抓前缀的 pricing
// 例：'gpt-4o-2024-08-06' 匹配 'gpt-4o'
function resolvePricing(platform, model) {
  const table = PRICING[platform];
  if (!table) return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (table[model]) return table[model];
  if (table['*']) return table['*'];
  // 模糊匹配：找到最长前缀
  let best = null;
  let bestLen = 0;
  for (const key of Object.keys(table)) {
    if (key === '*') continue;
    if (model.startsWith(key) && key.length > bestLen) {
      best = table[key];
      bestLen = key.length;
    }
  }
  if (best) return best;
  // 没匹配上：返回 0 价位（不报错，前端会显示 $0.00）
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

// 把各家厂商的 usage 对象归一化到标准字段
function normalizeUsage(platform, rawUsage) {
  if (!rawUsage || typeof rawUsage !== 'object') {
    return { prompt: 0, completion: 0, cacheRead: 0, cacheWrite: 0 };
  }
  // OpenAI（含 DeepSeek/Moonshot/Minimax 等 openai 协议）
  if (platform === 'openai' || platform === 'deepseek' || platform === 'moonshot'
      || platform === 'zhipu' || platform === 'qwen' || platform === 'minimax'
      || platform === 'minimax-anthropic' || platform === 'ollama') {
    const prompt = Number(rawUsage.prompt_tokens || 0);
    const completion = Number(rawUsage.completion_tokens || 0);
    const cacheRead = Number(
      (rawUsage.prompt_tokens_details && rawUsage.prompt_tokens_details.cached_tokens) || 0,
    );
    // OpenAI 没单独 cache_write
    return { prompt, completion, cacheRead, cacheWrite: 0 };
  }
  // Anthropic Claude
  if (platform === 'claude') {
    return {
      prompt: Number(rawUsage.input_tokens || 0),
      completion: Number(rawUsage.output_tokens || 0),
      cacheRead: Number(rawUsage.cache_read_input_tokens || 0),
      cacheWrite: Number(rawUsage.cache_creation_input_tokens || 0),
    };
  }
  // Google Gemini（usageMetadata 命名差异）
  if (platform === 'gemini') {
    return {
      prompt: Number(rawUsage.promptTokenCount || 0),
      completion: Number(rawUsage.candidatesTokenCount || 0),
      cacheRead: Number(rawUsage.cachedContentTokenCount || 0),
      cacheWrite: 0,
    };
  }
  return { prompt: 0, completion: 0, cacheRead: 0, cacheWrite: 0 };
}

// 算一行 usage 的 USD 费用
function calcCostUsd(platform, model, normUsage) {
  const p = resolvePricing(platform, model);
  const PER_M = 1_000_000;
  // cache write 算 input 价 + 写入溢价；OpenAI 没有 cache write 概念所以 cacheWrite 价 == input 价
  const inputCost = (normUsage.prompt * p.input) / PER_M;
  const outputCost = (normUsage.completion * p.output) / PER_M;
  const cacheReadCost = (normUsage.cacheRead * (p.cacheRead ?? p.input)) / PER_M;
  const cacheWriteCost = (normUsage.cacheWrite * (p.cacheWrite ?? p.input)) / PER_M;
  // 4 位小数 = $0.0001 精度，对 OpenAI 短回答能区分
  return Number((inputCost + outputCost + cacheReadCost + cacheWriteCost).toFixed(6));
}

/**
 * 独立开源版：无数据库，用量记录为 no-op（前端可从 SSE usage 事件自行统计）
 *   payload: { sessionId?, roundId?, platform, model, usage: rawUsageObject, source? }
 */
function recordUsage(payload) {
  const { platform, model = null, usage = null } = payload || {};
  if (!platform || !usage) return null;
  const norm = normalizeUsage(platform, usage);
  const cost = calcCostUsd(platform, model, norm);
  return { ...norm, cost_usd: cost };
}

// 用量查询 no-op（独立版无 DB）
function getUsageBySession() { return []; }
function getUsageSummary() { return { total: {}, byPlatform: [], sinceDays: 30 }; }
function getUsageByRound() { return []; }

/**
 * 平台配置表
 * - chatFormat: openai | anthropic | gemini | ollama
 * - baseUrl: 默认请求地址
 * - defaultModel: 平台默认模型
 * - streamPath: 流式响应路径 (openai 格式下使用同一 endpoint)
 */
const PLATFORMS = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    chatFormat: "openai",
  },
  claude: {
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-20241022",
    chatFormat: "anthropic",
  },
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-1.5-flash",
    chatFormat: "gemini",
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    chatFormat: "openai",
  },
  minimax: {
    label: "Minimax (MiniMax)",
    baseUrl: "https://api.minimaxi.com/v1",
    defaultModel: "MiniMax-M3",
    chatFormat: "openai",
  },
  "minimax-anthropic": {
    label: "Minimax (Anthropic 兼容)",
    baseUrl: "https://api.minimaxi.com",
    defaultModel: "MiniMax-M3",
    chatFormat: "anthropic",
    // 该平台走 /anthropic/v1/messages（不是标准的 /v1/messages）
    anthropicPath: "/anthropic/v1/messages",
  },
  moonshot: {
    label: "Moonshot (月之暗面)",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    chatFormat: "openai",
  },
  zhipu: {
    label: "智谱 AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    chatFormat: "openai",
  },
  qwen: {
    label: "通义千问 (DashScope)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-turbo",
    chatFormat: "openai",
  },
  ollama: {
    label: "Ollama (本地)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    chatFormat: "openai",
  },
};

// tempCreds 优先（来自前端 body 一次性，纯会话不落盘）
//   - tempCreds = { api_key, base_url, model_name }
//   - 无 tempCreds 时抛错（独立版不读 DB）
function getKey(platform, tempCreds = null) {
  if (tempCreds && tempCreds.api_key) {
    return {
      api_key: tempCreds.api_key,
      base_url: tempCreds.base_url || null,
      model_name: tempCreds.model_name || null,
      _fromTemp: true,
    };
  }
  const e = new Error(`[${platform}] 未提供 AI Key，请先在浏览器里点 🔑 配置会话 Key`);
  // 周期 2 P0-5: 缺 key 是客户端错，应当走 4xx 而非被路由 catch 兜底成 5xx
  e.status = 400;
  throw e;
}

function getPlatformConfig(platform) {
  return PLATFORMS[platform] || null;
}

function listPlatforms() {
  return Object.entries(PLATFORMS).map(([key, v]) => ({
    key,
    label: v.label,
    defaultModel: v.defaultModel,
    defaultBaseUrl: v.baseUrl,
  }));
}

/**
 * 保存 API Key（支持同一平台多个 Key）
 * 新保存的 Key 会成为该平台的激活 Key
 */
// SSRF 防护：baseUrl 必须走 https 且 host 在白名单内
// 防止用户把请求指向内网 / 云元数据 / 任意第三方 server
// 周期 1 P0-3：所有白名单主机强制 https；Ollama 兼容走 AI_ALLOW_HTTP=1 显式开关
// Ollama 主机在 dev/prod 都允许 http（前提 ALLOW_HTTP 开启），避免破坏本地开发
const ALLOWED_BASE_HOSTS = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'api.minimaxi.com',
  'api.moonshot.cn',
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
]);
// Ollama 兼容：固定本机端口（11434/11435）允许 http，但需显式 AI_ALLOW_HTTP=1
const OLLAMA_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ALLOW_HTTP = process.env.AI_ALLOW_HTTP === '1';

function validateBaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('baseUrl 不能为空');
  }
  let u;
  try {
    u = new URL(rawUrl);
  } catch (_) {
    throw new Error('baseUrl 不是合法 URL');
  }
  const host = u.hostname.toLowerCase();
  const isHttps = u.protocol === 'https:';
  const isOllama = OLLAMA_HOSTS.has(host);

  // 1) 通用白名单：必须 https
  if (ALLOWED_BASE_HOSTS.has(host)) {
    if (!isHttps) {
      throw new Error('baseUrl 必须是 https 协议');
    }
    return rawUrl;
  }

  // 2) Ollama 本机：默认仍按 https 优先；http 需 AI_ALLOW_HTTP=1 显式开启
  if (isOllama) {
    if (u.protocol === 'http:' && ALLOW_HTTP) return rawUrl;
    if (u.protocol === 'http:') {
      throw new Error(
        'baseUrl 为 http 协议，需设置环境变量 AI_ALLOW_HTTP=1（仅推荐本地 Ollama）',
      );
    }
    if (isHttps) return rawUrl;
    throw new Error('baseUrl 必须是 http(s) 协议');
  }

  // 3) 其它一律拒绝（无论协议）
  throw new Error(
    'baseUrl 主机不在白名单（' + host + '）。如需新厂商请改 ALLOWED_BASE_HOSTS',
  );
}

// 周期 3 P0-1: IP 分类 / DNS 校验 / safeFetch 全部下沉到 ssrf-guard.js
//   保持 ai.js 内以下公共 API 兼容：validateBaseUrl / validateBaseUrlWithDns / isPrivateIp
//   旧实现（周期 2 P1-8 正则）已被 ssrf-guard 的 classifyIp 覆盖更精确分类
const isPrivateIp = ssrfGuard.isPrivateIp;
const validateBaseUrlWithDns = ssrfGuard.validateBaseUrlWithDns;
const { safeFetch } = ssrfGuard;

// 独立开源版：Key 管理为 no-op（AI Key 纯会话，由浏览器 sessionKeys 管理，不落盘）
function saveKey() { throw new Error('独立版不支持服务端存 Key，请在浏览器里点 🔑 配置会话 Key'); }
function listKeys() { return []; }
function deleteKey() { return { changes: 0 }; }
function getKeysByPlatform() { return []; }
function switchKey() { throw new Error('独立版不支持服务端存 Key'); }

/**
 * 把图片附件转成各平台 vision 格式的 content
 * - openai: content 数组 [{type:"text", text:"..."}, {type:"image_url", image_url:{url:"data:..."}}]
 * - anthropic: content 数组 [{type:"text", text:"..."}, {type:"image", source:{type:"base64", media_type:"...", data:"..."}}]
 * - gemini: parts 数组 [{text:"..."}, {inline_data:{mime_type:"...", data:"..."}}]
 * 返回 { messages, geminiContents, anthropicSystem, lastWasUser }
 *   - messages: 给 openai 用（已经是含图片块的数组）
 *   - geminiContents: 给 gemini 用
 *   - anthropicSystem + anthropicUserMsgs: 给 anthropic 用
 */
function buildVisionContent(chatFormat, messages, visionAttachments) {
  if (!visionAttachments || visionAttachments.length === 0) {
    return { hasImages: false };
  }
  // 把图片附加到最后一条 user message
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return i;
    }
    return -1;
  })();
  if (lastUserIdx < 0) {
    throw new Error('上传图片/文件时必须在 user 消息里附带文字');
  }
  const lastUser = messages[lastUserIdx];
  const textContent = typeof lastUser.content === 'string' ? lastUser.content : '';

  if (chatFormat === 'openai') {
    const newMessages = messages.map((m, i) => {
      if (i !== lastUserIdx) return m;
      const content = [{ type: 'text', text: textContent }];
      for (const att of visionAttachments) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${att.mime || 'image/png'};base64,${att.data}` },
        });
      }
      return { ...m, content };
    });
    return { hasImages: true, openaiMessages: newMessages };
  }

  if (chatFormat === 'anthropic') {
    // Anthropic: system 单独抽出来，user/assistant 在 messages 里；content 也是数组
    let system = '';
    const userMsgs = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'system') {
        system += (system ? '\n' : '') + (typeof m.content === 'string' ? m.content : '');
        continue;
      }
      if (i === lastUserIdx) {
        const content = [{ type: 'text', text: textContent }];
        for (const att of visionAttachments) {
          // Anthropic media_type: image/png, image/jpeg, image/gif, image/webp
          let mt = att.mime || 'image/png';
          if (mt === 'image/jpg') mt = 'image/jpeg';
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: mt, data: att.data },
          });
        }
        userMsgs.push({ role: 'user', content });
      } else {
        userMsgs.push({ role: m.role, content: m.content });
      }
    }
    return { hasImages: true, anthropicSystem: system, anthropicUserMsgs: userMsgs };
  }

  if (chatFormat === 'gemini') {
    let systemInstruction = null;
    const contents = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'system') {
        systemInstruction = { parts: [{ text: typeof m.content === 'string' ? m.content : '' }] };
        continue;
      }
      const role = m.role === 'assistant' ? 'model' : 'user';
      if (i === lastUserIdx) {
        const parts = [{ text: textContent }];
        for (const att of visionAttachments) {
          let mt = att.mime || 'image/png';
          if (mt === 'image/jpg') mt = 'image/jpeg';
          parts.push({ inline_data: { mime_type: mt, data: att.data } });
        }
        contents.push({ role, parts });
      } else {
        contents.push({ role, parts: [{ text: typeof m.content === 'string' ? m.content : '' }] });
      }
    }
    return { hasImages: true, geminiSystemInstruction: systemInstruction, geminiContents: contents };
  }

  return { hasImages: false };
}

/**
 * 通用 chat（非流式）
 * - messages: [{role, content}]
 * - options: { temperature, max_tokens, model }
 * - visionAttachments: [{filename, mime, data: base64}] —— 走平台 vision 格式
 */
async function chat(platform, messages, options = {}, visionAttachments = [], tempCreds = null) {
  const cfg = PLATFORMS[platform];
  if (!cfg) {
    const e = new Error("不支持的平台: " + platform);
    e.status = 400;
    throw e;
  }
  const keyRow = getKey(platform, tempCreds);
  if (!keyRow) {
    const e = new Error("请先在「AI 对话」页设置该平台的 API Key");
    e.status = 400;
    throw e;
  }

  // 周期 2 P1-8: 自定义 baseUrl 必须经过 DNS 二次校验（防 SSRF rebinding）
  //   默认 baseUrl 来自 cfg.baseUrl（白名单内的厂商域名），IP 也已固定为公网，跳过
  const baseUrl = await resolveBaseUrl(keyRow.base_url || cfg.baseUrl, cfg.baseUrl);

  const model = options.model || keyRow.model_name || cfg.defaultModel;
  const temperature = options.temperature ?? 0.7;
  const max_tokens = options.max_tokens ?? 2048;

  const vision = buildVisionContent(cfg.chatFormat, messages, visionAttachments);

  if (cfg.chatFormat === "openai") {
    const url = baseUrl + "/chat/completions";
    const outMessages = vision.hasImages ? vision.openaiMessages : messages;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + keyRow.api_key,
      },
      body: JSON.stringify({
        model,
        messages: outMessages,
        temperature,
        max_tokens,
        stream: false,
      }),
      timeout: 120000,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`[${platform}] ${resp.status} ${text}`);
    }
    const data = await resp.json();
    const choice = (data.choices || [])[0];
    const rawContent = choice?.message?.content || "";
    // 过滤 <think> 标签（DeepSeek / Qwen 等推理模型会返回）
    const content = rawContent
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/<\/?think>/g, "")
      .trim();
    return {
      platform,
      model,
      content,
      usage: data.usage || null,
      raw: data,
    };
  }

  if (cfg.chatFormat === "anthropic") {
    // minimax-anthropic 等厂商走自定义 path（如 /anthropic/messages），
    // 标准 Anthropic 走 /messages
    const url = (cfg.anthropicPath ? baseUrl + cfg.anthropicPath : baseUrl + "/messages");
    let system = "";
    let userMsgs = [];
    if (vision.hasImages) {
      system = vision.anthropicSystem;
      userMsgs = vision.anthropicUserMsgs;
    } else {
      for (const m of messages) {
        if (m.role === "system") system += (system ? "\n" : "") + m.content;
        else userMsgs.push({ role: m.role, content: m.content });
      }
    }
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": keyRow.api_key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system,
        messages: userMsgs,
        max_tokens,
        temperature,
      }),
      timeout: 120000,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`[${platform}] ${resp.status} ${text}`);
    }
    const data = await resp.json();
    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    return {
      platform,
      model,
      content: text,
      usage: data.usage || null,
      raw: data,
    };
  }

  if (cfg.chatFormat === "gemini") {
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(keyRow.api_key)}`;
    let body;
    if (vision.hasImages) {
      body = {
        contents: vision.geminiContents,
        generationConfig: { temperature, maxOutputTokens: max_tokens },
      };
      if (vision.geminiSystemInstruction) body.systemInstruction = vision.geminiSystemInstruction;
    } else {
      let systemInstruction = null;
      const contents = [];
      for (const m of messages) {
        if (m.role === "system") {
          systemInstruction = { parts: [{ text: m.content }] };
          continue;
        }
        contents.push({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        });
      }
      body = {
        contents,
        generationConfig: { temperature, maxOutputTokens: max_tokens },
      };
      if (systemInstruction) body.systemInstruction = systemInstruction;
    }
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeout: 120000,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`[${platform}] ${resp.status} ${text}`);
    }
    const data = await resp.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text)
      .join("\n");
    return {
      platform,
      model,
      content: text,
      usage: data.usageMetadata || null,
      raw: data,
    };
  }

  throw new Error("未实现的 chat 格式: " + cfg.chatFormat);
}

/**
 * 解析用户/默认 baseUrl：先去掉尾部斜杠，再走 DNS 二次校验
 */
async function resolveBaseUrl(userBaseUrl, defaultBaseUrl) {
  const cleaned = (userBaseUrl || defaultBaseUrl || '').replace(/\/+$/, '');
  if (!cleaned) throw new Error('baseUrl 为空');
  // 周期 2 P1-8: DNS 二次校验（防 SSRF rebinding）
  await validateBaseUrlWithDns(cleaned);
  return cleaned;
}

/**
 * 流式 chat（SSE）
 * - onChunk(text) 每收到一段增量文本就回调
 * 返回最终聚合 content
 */
async function chatStream(platform, messages, options, onChunk, signal, visionAttachments = [], tempCreds = null) {
  const cfg = PLATFORMS[platform];
  if (!cfg) {
    const e = new Error("不支持的平台: " + platform);
    // 周期 2 P0-5: 同 chat() —— 未知 platform 走 4xx
    e.status = 400;
    throw e;
  }
  const keyRow = getKey(platform, tempCreds);
  if (!keyRow) {
    const e = new Error("请先在「AI 对话」页设置该平台的 API Key");
    e.status = 400;
    throw e;
  }

  // 周期 2 P1-8: 自定义 baseUrl 必须经过 DNS 二次校验（防 SSRF rebinding）
  //   默认 baseUrl 来自 cfg.baseUrl（白名单内的厂商域名），IP 也已固定为公网，跳过
  const baseUrl = await resolveBaseUrl(keyRow.base_url || cfg.baseUrl, cfg.baseUrl);

  const model = options.model || keyRow.model_name || cfg.defaultModel;
  const temperature = options.temperature ?? 0.7;
  const max_tokens = options.max_tokens ?? 2048;

  const vision = buildVisionContent(cfg.chatFormat, messages, visionAttachments);

  let fullText = "";
  // 上游 SSE 里通常在最后一个 chunk 或 message_delta 事件里返回 usage。
  // 不同厂商实现差异大：OpenAI 给 obj.usage、Anthropic 给 message_start.usage + message_delta.usage、
  // Gemini 每个 chunk 末尾都有 usageMetadata。我们每个 chunk 都检查，最后一次覆盖胜出。
  let capturedUsage = null;

  if (cfg.chatFormat === "openai") {
    const url = baseUrl + "/chat/completions";
    const outMessages = vision.hasImages ? vision.openaiMessages : messages;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + keyRow.api_key,
      },
      body: JSON.stringify({
        model,
        messages: outMessages,
        temperature,
        max_tokens,
        stream: true,
        // 让 OpenAI 在最后一个 SSE chunk 里附带 usage（prompt/completion tokens）；
        // DeepSeek/Moonshot/Qwen/Minimax/Zhipu/Ollama 等 openai 协议厂商都支持此字段
        stream_options: { include_usage: true },
      }),
      timeout: 0,
    });
    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      throw new Error(`[${platform}] ${resp.status} ${text}`);
    }
    // 防御：有些厂商（如 Minimax）HTTP 200 但 body 是 JSON 错误对象，
    // 走 SSE 解析会静默失败。提前 peek content-type。
    const ct = (resp.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json") && !ct.includes("event-stream")) {
      const text = await resp.text();
      throw new Error(`[${platform}] ${resp.status} ${text.slice(0, 500)}`);
    }
    await readSse(resp.body, (event) => {
      if (!event || !event.data) return;
      if (event.data === "[DONE]") return;
      try {
        const obj = JSON.parse(event.data);
        const choice = obj.choices?.[0];
        const deltaContent = choice?.delta?.content;
        const reasoningContent = choice?.delta?.reasoning_content;
        if (reasoningContent) {
          // 思维链内容，跳过（不推给客户端）
          return;
        }
        if (deltaContent) {
          fullText += deltaContent;
          onChunk && onChunk(deltaContent);
        }
        // 抓 usage：OpenAI 在 stream_options.include_usage 时最后一个 chunk 给 obj.usage
        if (obj.usage) {
          capturedUsage = obj.usage;
        }
      } catch (_) {}
    });
    // 过滤 <think> 标签
    fullText = fullText
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/<\/?think>/g, "");
    return { platform, model, content: fullText, usage: capturedUsage };
  }

  if (cfg.chatFormat === "anthropic") {
    // minimax-anthropic 等厂商走自定义 path（如 /anthropic/messages），
    // 标准 Anthropic 走 /messages
    const url = (cfg.anthropicPath ? baseUrl + cfg.anthropicPath : baseUrl + "/messages");
    let system = "";
    let userMsgs = [];
    if (vision.hasImages) {
      system = vision.anthropicSystem;
      userMsgs = vision.anthropicUserMsgs;
    } else {
      for (const m of messages) {
        if (m.role === "system") system += (system ? "\n" : "") + m.content;
        else userMsgs.push({ role: m.role, content: m.content });
      }
    }
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": keyRow.api_key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system,
        messages: userMsgs,
        max_tokens,
        temperature,
        stream: true,
      }),
      timeout: 0,
    });
    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      throw new Error(`[${platform}] ${resp.status} ${text}`);
    }
    await readSse(resp.body, (event) => {
      if (!event || !event.data) return;
      try {
        const obj = JSON.parse(event.data);
        if (
          obj.type === "content_block_delta" &&
          obj.delta?.type === "text_delta"
        ) {
          const delta = obj.delta.text || "";
          if (delta) {
            fullText += delta;
            onChunk && onChunk(delta);
          }
        }
        // 抓 usage：
        //   - message_start 事件带 message.usage（input_tokens + cache_*）
        //   - message_delta 事件带 usage（output_tokens）
        //   两者 merge 才是完整 usage
        if (obj.message && obj.message.usage) {
          capturedUsage = { ...(capturedUsage || {}), ...obj.message.usage };
        }
        if (obj.usage && obj.type === "message_delta") {
          capturedUsage = { ...(capturedUsage || {}), ...obj.usage };
        }
      } catch (_) {}
    });
    return { platform, model, content: fullText, usage: capturedUsage };
  }

  if (cfg.chatFormat === "gemini") {
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(keyRow.api_key)}&alt=sse`;
    let body;
    if (vision.hasImages) {
      body = {
        contents: vision.geminiContents,
        generationConfig: { temperature, maxOutputTokens: max_tokens },
      };
      if (vision.geminiSystemInstruction) body.systemInstruction = vision.geminiSystemInstruction;
    } else {
      let systemInstruction = null;
      const contents = [];
      for (const m of messages) {
        if (m.role === "system") {
          systemInstruction = { parts: [{ text: m.content }] };
          continue;
        }
        contents.push({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        });
      }
      body = {
        contents,
        generationConfig: { temperature, maxOutputTokens: max_tokens },
      };
      if (systemInstruction) body.systemInstruction = systemInstruction;
    }
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeout: 0,
    });
    if (!resp.ok || !resp.body) {
      const text = await resp.text();
      throw new Error(`[${platform}] ${resp.status} ${text}`);
    }
    await readSse(resp.body, (event) => {
      if (!event || !event.data) return;
      try {
        const obj = JSON.parse(event.data);
        const text = (obj.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text)
          .join("");
        if (text) {
          fullText += text;
          onChunk && onChunk(text);
        }
        // Gemini 每个 chunk 末尾都有 usageMetadata，最后一次覆盖胜出
        if (obj.usageMetadata) {
          capturedUsage = obj.usageMetadata;
        }
      } catch (_) {}
    });
    return { platform, model, content: fullText, usage: capturedUsage };
  }

  throw new Error("未实现的流式格式: " + cfg.chatFormat);
}

/**
 * 简易 SSE 解析（按 \n\n 切分事件）
 */
function readSse(stream, onEvent, signal) {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder();
    let buf = "";
    stream.on("data", (chunk) => {
      buf += decoder.decode(chunk, { stream: true });
      let idx;
      // 兼容 \r\n\r\n 与 \n\n 两种 SSE 分隔
      const re = /\r?\n\r?\n/;
      while ((idx = buf.search(re)) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + (buf.substr(idx, 4) === "\r\n\r\n" ? 4 : 2));
        const lines = raw.split(/\r?\n/);
        let data = "";
        for (const line of lines) {
          const t = line.trim();
          if (t.startsWith("data:")) data += t.slice(5).trim();
          else if (t.startsWith("event:")) onEvent.event = t.slice(6).trim();
        }
        if (data) onEvent({ data, event: onEvent.event });
        onEvent.event = null;
      }
    });
    stream.on("end", () => {
      // 收尾：还有残留 buffer
      if (buf.trim()) {
        const lines = buf.split(/\r?\n/);
        let data = "";
        for (const line of lines) {
          const t = line.trim();
          if (t.startsWith("data:")) data += t.slice(5).trim();
        }
        if (data) onEvent({ data, event: "data" });
      }
      resolve();
    });
    stream.on("error", (e) => reject(e));
    if (signal) {
      signal.addEventListener("abort", () => {
        try { stream.destroy && stream.destroy(); } catch (_) {}
        resolve(); // abort 时直接 resolve，不阻塞 chatStream
      });
    }
  });
}

module.exports = {
  PLATFORMS,
  PRICING,
  listPlatforms,
  saveKey,
  listKeys,
  deleteKey,
  getKey,
  getKeysByPlatform,
  switchKey,
  chat,
  chatStream,
  recordUsage,
  getUsageBySession,
  getUsageSummary,
  getUsageByRound,
  // 暴露内部工具函数（tests 用）
  _internal: { normalizeUsage, calcCostUsd, resolvePricing, validateBaseUrl, validateBaseUrlWithDns, isPrivateIp, resolveBaseUrl },
};
