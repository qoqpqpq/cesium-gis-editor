// nlQueryParser — 阶段 3 AI 智能体 · 本地规则引擎
//
// 中文自然语言 → QueryBuilder 规则对象
//   { combinator: 'AND' | 'OR', rules: [{ field, op, value }, ...] }
//
// 设计目标：
//   - 完全本地、零网络/零 LLM 依赖
//   - 关键短语 + 数字识别，匹配后产出可被 compileQuery 直接吃的规则
//   - 不识别的输入返回 { query: null, hints: [...], leftover }
//   - 严格 sanitization：拒绝 prototype 污染 / NaN / 控制字符
//
// 支持的中文短语（不区分大小写、按出现顺序叠加）：
//   字段 / op 识别（按关键词命中即固定）：
//     - "name 含 X" / "名称含 X" / "名字含 X"   → name contains X
//     - "name 等于 X" / "叫 X"                  → name eq X
//     - "name 以 X 开头" / "name 起始 X"         → name startsWith X
//     - "kind 是 X" / "类型是 X"                 → kind eq X
//     - "layer 是 X" / "图层是 X"                → layerId eq X
//     - "X 字段大于 N" / "X 字段>=N"              → fieldX gt(e)/lt(e) N
//     - "X 字段包含 Y" / "X 字段含 Y"            → fieldX contains Y
//     - "X 字段在 A,B,C 中"                     → fieldX in [A,B,C]
//     - "X 字段为空"                            → fieldX empty
//   范围：
//     - "在 W,S,E,N 范围内" / "bbox 内"          → bbox W,S,E,N（多规则叠加）
//   逻辑连接：
//     - "且" / "并且" / "和"（并列）→ combinator AND（默认就是 AND）
//     - "或" / "或者"            → 切到 OR（同句内仍 AND；新一组加 OR）
//   比较：
//     - "大于"/"高于"/"超过"     → gt
//     - "大于等于"/">="          → gte
//     - "小于"/"低于"/"少于"     → lt
//     - "小于等于"/"<="          → lte
//     - "等于"/"是"             → eq
//     - "不等于"/"不是"/"非"     → neq
//   范围数字解析："100,200,300,400" → [100,200,300,400]
//
// 示例：
//   parseNlQuery('name 含公园且 area 大于 1000',
//                [{ name: 'area', type: 'number' }])
//   → { combinator: 'AND', rules: [
//       { field: 'name', op: 'contains', value: '公园' },
//       { field: 'area', op: 'gt', value: 1000 } ] }

const NUMBER_RE = /-?\d+(?:\.\d+)?/g;
const CN_NUM = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100, 千: 1000, 万: 10000 };

// 把字符串里的中文数字转阿拉伯数字（"一百二十" → 120）
// 仅支持最常见模式；不支持就回退原值
function cnNumToInt(s) {
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (!/[零一二两三四五六七八九十百千万]/.test(s)) return null;
  // 算法：分段处理万/亿。简化为扫描式：
  // 单位乘子表：十=10 百=100 千=1000 万=10000
  // 数字乘子表：零=0 一=1 二=2 ... 九=9
  // 段内：累加 num * unit；遇到更大 unit 时把段和乘 unit 推入 total
  const UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  const NUMS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0;
  let section = 0; // 当前万段累加
  let lastNum = 0;
  for (const ch of s) {
    if (NUMS[ch] != null) {
      lastNum = NUMS[ch];
    } else if (UNITS[ch] != null) {
      const u = UNITS[ch];
      if (u === 10000) {
        // 万：把当前段乘 10000 加入 total
        section += (lastNum || 1) * u;
        total += section;
        section = 0;
        lastNum = 0;
      } else {
        section += (lastNum || (u === 10 ? 1 : 0)) * u;
        lastNum = 0;
      }
    } else {
      // 未知字符 → 中止
      return null;
    }
  }
  total += section + lastNum;
  return total > 0 ? total : null;
}

// 把任意 token 强制转有限数；失败返回 null
function toFiniteNumber(t) {
  if (t == null) return null;
  const s = String(t).trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  const cn = cnNumToInt(s);
  return Number.isFinite(cn) ? cn : null;
}

// 强转 string，剥首尾引号、避免 prototype 注入
function toCleanString(t) {
  if (t == null) return '';
  let s = String(t);
  // 去首尾匹配引号（含中英文）
  s = s.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '');
  // 拒绝 prototype 键（防 [Object.prototype] 攻击）
  if (s === '__proto__' || s === 'constructor' || s === 'prototype') return '';
  // 控制字符去掉
  s = s.replace(/[\u0000-\u001f\u007f]/g, '');
  return s.trim();
}

// 在字符串里找第一个数字；优先阿拉伯数字，找不到再试中文数字
function extractFirstNumber(s) {
  if (!s) return null;
  const str = String(s);
  const m = str.match(NUMBER_RE);
  if (m) return toFiniteNumber(m[0]);
  // 中文数字：剥掉前缀/后缀非数字字符
  const cn = str.match(/[零一二两三四五六七八九十百千万]+/);
  if (cn) return cnNumToInt(cn[0]);
  return null;
}

// 在字符串里找连续 4 个数字当作 bbox
function extractBbox(s) {
  if (!s) return null;
  const m = String(s).match(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const nums = m[0].split(',').map(toFiniteNumber);
  if (nums.some((n) => n == null)) return null;
  const [w, s2, e, n2] = nums;
  return { west: w, south: s2, east: e, north: n2 };
}

// 把 fields 转成名集合（让 "name" / "kind" / 自定义字段都能匹配）
function buildFieldSet(fields) {
  const set = new Set();
  const nameMap = new Map();
  for (const f of fields || []) {
    if (!f || !f.name) continue;
    const name = String(f.name);
    set.add(name);
    nameMap.set(name.toLowerCase(), name);
  }
  // 内置列也接受
  for (const builtin of ['name', 'kind', 'layerId']) {
    set.add(builtin);
    nameMap.set(builtin.toLowerCase(), builtin);
  }
  return { set, nameMap };
}

// 在 fields 里找（忽略大小写、忽略下划线 vs 驼峰）匹配 token 的真实字段名
//   - 命中：返回原字段名（保持数据契约）
//   - 未命中：如果是合法标识符且没有 prototype 风险，作为「未声明字段」直接接受（NL 阶段先信任用户）
function resolveFieldName(token, fields) {
  if (!token) return null;
  // 防御：prototype 注入
  const t = String(token);
  if (t === '__proto__' || t === 'constructor' || t === 'prototype') return null;
  const want = t.toLowerCase().replace(/[_\-\s]/g, '');
  for (const f of fields || []) {
    if (!f || !f.name) continue;
    const got = String(f.name).toLowerCase().replace(/[_\-\s]/g, '');
    if (got === want) return f.name;
  }
  // 通用词 → 内置列
  const aliases = {
    名称: 'name', 名字: 'name', 标题: 'name',
    类型: 'kind', 种类: 'kind',
    图层: 'layerId',
  };
  if (aliases[t]) return aliases[t];
  // 兜底：把 token 作为字段名直接接受（queryCompiler evalRule 会用 attrs[field] 兜底）
  // 但要保证至少 1 字符、不是操作符/连接词
  if (want.length >= 1 && !/^(且|并且|和|或|或者|含|是|大于|小于|等于|不为空|字段|在|中|的|得|地|个|名)$/.test(t)) {
    return t;
  }
  return null;
}

// 解析一段中文条件块，返回 { field, op, value } 或 null
// 每个 blockText 都假定是「剩余段」，逐规则扣减
function parseConditionBlock(text, fields) {
  if (!text) return null;

  // ---- 0) bbox（最高优先级，含数字 4 元组） ----
  if (/bbox|范围|范围内|经纬度范围/.test(text)) {
    const bb = extractBbox(text);
    if (bb) {
      return { field: '__bbox__', op: 'bbox', value: bb, consumed: text.length };
    }
  }

  // ---- 1) startsWith（高优先级，避免被 fieldOpRe 抢走"以...开头"） ----
  const startsRe = /^([\u4e00-\u9fa5\w]+)\s*(以\s*(.+?)\s*开头|起始于|起始)\s*(.*)$/;
  let m = text.match(startsRe);
  if (m) {
    const [, col, , prefix] = m;
    const field = resolveFieldName(col, fields);
    if (field) {
      const value = toCleanString(prefix);
      if (value) return { field, op: 'startsWith', value, consumed: text.length };
    }
  }

  // ---- 2) empty（避免 builtinRe 把"是空"切成 是 + 空） ----
  const emptyRe = /^([\u4e00-\u9fa5\w]+)\s*(是空|为空|为空值?)\s*$/;
  m = text.match(emptyRe);
  if (m) {
    const [, col] = m;
    const field = resolveFieldName(col, fields);
    if (field) return { field, op: 'empty', value: null, consumed: text.length };
  }

  // ---- 3) 内置列便捷说法（让内置名优先匹配） ----
  const builtinRe = /^(name|名称|名字|kind|类型|种类|layerId|layer|图层)\s*(包含|含|不含|等于|为|是|不是|不等于|大于等于|大于|超过|高于|小于等于|小于|低于|少于|起始|以.+?开头|在.+?中|为空|是空)\s*(.*)$/;
  m = text.match(builtinRe);
  if (m) {
    const [, col, opToken, rest] = m;
    const builtinCol = resolveFieldName(col, fields);
    if (builtinCol) {
      const op = mapOpToken(opToken, rest);
      if (op) {
        const value = extractValueForOp(op, rest, fields, builtinCol);
        return { field: builtinCol, op, value, consumed: text.length };
      }
    }
  }

  // ---- 4) "X 在 A,B,C 中"（in） ----
  const inRe = /^([\u4e00-\u9fa5\w]+)\s*在\s*([^中]+?)\s*中\s*$/;
  m = text.match(inRe);
  if (m) {
    const [, col, listStr] = m;
    const field = resolveFieldName(col, fields);
    if (field) {
      const arr = String(listStr).split(/[，,]/).map(toCleanString).filter(Boolean);
      if (arr.length) return { field, op: 'in', value: arr, consumed: text.length };
    }
  }

  // ---- 5) "X 字段 op Y" / "X op Y"（含数字比较） ----
  const fieldOpRe = /^([\u4e00-\u9fa5\w]+)\s*(?:字段\s*)?(包含|含|不含|等于|为|是|不是|不等于|大于等于|大于|超过|高于|小于等于|小于|低于|少于|起始|以.+?开头)\s*(.+?)\s*$/;
  m = text.match(fieldOpRe);
  if (m) {
    const [, fname, opToken, rest] = m;
    const field = resolveFieldName(fname, fields);
    if (field) {
      const op = mapOpToken(opToken, rest);
      if (op) {
        const value = extractValueForOp(op, rest, fields, field);
        return { field, op, value, consumed: text.length };
      }
    }
  }

  // ---- 6) 兜底："X 是 V" / "X 等于 V" / "X 为 V" ----
  const eqRe = /^([\u4e00-\u9fa5\w]+)\s*(是|等于|为)\s*(.+?)(?=\s*(?:且|并且|和|或|或者|$))/;
  m = text.match(eqRe);
  if (m) {
    const [, col, , rawVal] = m;
    const field = resolveFieldName(col, fields);
    if (field) {
      const value = toCleanString(rawVal);
      if (value) return { field, op: 'eq', value, consumed: text.length };
    }
  }
  const neqRe = /^([\u4e00-\u9fa5\w]+)\s*(不是|不等于)\s*(.+?)(?=\s*(?:且|并且|和|或|或者|$))/;
  m = text.match(neqRe);
  if (m) {
    const [, col, , rawVal] = m;
    const field = resolveFieldName(col, fields);
    if (field) {
      const value = toCleanString(rawVal);
      if (value) return { field, op: 'neq', value, consumed: text.length };
    }
  }

  return null;
}

// 把 op 关键字映射到 queryCompiler 的 op
function mapOpToken(tok, rest) {
  const t = String(tok || '');
  if (/^包含$|^含$/.test(t)) return 'contains';
  if (/^不含$/.test(t)) return 'neq';
  if (/^起始$|^以.+?开头$/.test(t)) return 'startsWith';
  if (/^为空$|是空|为空值?/.test(t)) return 'empty';
  if (/^等于$|^为$|^是$/.test(t)) return 'eq';
  if (/^不是$|^不等于$/.test(t)) return 'neq';
  if (/^大于等于$|^>=$/.test(t)) return 'gte';
  if (/^大于$|^超过$|^高于$/.test(t)) return 'gt';
  if (/^小于等于$|^<=$/.test(t)) return 'lte';
  if (/^小于$|^低于$|^少于$/.test(t)) return 'lt';
  if (/^在.+?中$|^在列表$/.test(t)) return 'in';
  return null;
}

function extractValueForOp(op, rest, fields, fieldName) {
  if (op === 'empty') return null;
  if (op === 'in') {
    // "在 A,B,C 中" 或 "A,B,C 中"
    const raw = String(rest || '').replace(/中.*$/, '').trim();
    const parts = raw.split(/[，,]/).map(toCleanString).filter(Boolean);
    return parts;
  }
  if (op === 'bbox') return extractBbox(rest);
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    // 数字；优先取第一个
    return extractFirstNumber(rest);
  }
  // 字符串型 op
  let v = String(rest || '');
  // 切到下一个连接词前
  v = v.split(/(?:且|并且|和|或|或者)/)[0];
  // 切到 " 的 / 得 / 地" 前
  v = v.split(/(?:的|得|地)/)[0];
  return toCleanString(v);
}

// 主入口：自然语言字符串 + fields → 编译后 query
// 返回：
//   { query: {combinator, rules} | null,
//     hints: ['未能识别 ...'], leftover: '未消费部分' }
export function parseNlQuery(input, fields) {
  if (!input || typeof input !== 'string') {
    return { query: null, hints: ['空输入'], leftover: '' };
  }
  let text = String(input).trim();
  if (!text) return { query: null, hints: ['空输入'], leftover: '' };

  // 顶层按"或者" 或 空格/标点包围的"或"切 OR 组
  // 拆完每个 OR 段内部仍是 AND；显式支持空白/标点包裹
  const orParts = text.split(/\s*(?:或者|或)\s*(?=[^一-龥]|$)/);
  const allRules = [];
  let usedOr = false;
  const bboxGroups = [];
  let hints = [];

  for (const orPartRaw of orParts) {
    let orPart = orPartRaw.trim();
    if (!orPart) continue;

    // AND 段：用 "且|并且" 切；"和" 因为单字会与其它汉字粘连，仅当左右是空白/标点时切
    const andParts = orPart.split(/\s*(?:且|并且)\s*|(?<=\s)和(?=\s|[，。；,.;]|$)/);

    for (let seg of andParts) {
      seg = seg.trim();
      if (!seg) continue;

      const rule = parseConditionBlock(seg, fields);
      if (rule) {
        if (rule.field === '__bbox__' && rule.op === 'bbox') {
          bboxGroups.push(rule.value);
        } else {
          allRules.push({ field: rule.field, op: rule.op, value: rule.value });
        }
      } else {
        hints.push(`未识别片段：${seg}`);
      }
    }
    // orPart 之间插入 OR（在下一轮循环时设置标记）
    if (orParts.length > 1) usedOr = true;
  }

  if (allRules.length === 0 && bboxGroups.length === 0) {
    return {
      query: null,
      hints: hints.length ? hints : ['无规则产出'],
      leftover: text,
    };
  }

  const out = {
    hints,
    leftover: '',
  };
  if (allRules.length > 0) {
    out.query = {
      combinator: usedOr ? 'OR' : 'AND',
      rules: allRules,
    };
  } else {
    // 只有 bbox：给一个空规则但带 bboxGroups，调用方负责预筛
    out.query = { combinator: 'AND', rules: [] };
  }
  if (bboxGroups.length > 0) out.bboxGroups = bboxGroups;
  return out;
}

// 内部 helpers 也导出，方便测试与上层复用
export const __internals = {
  toFiniteNumber,
  cnNumToInt,
  toCleanString,
  extractFirstNumber,
  extractBbox,
  buildFieldSet,
  resolveFieldName,
  mapOpToken,
  extractValueForOp,
};
