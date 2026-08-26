// aiDocumentExporter — 阶段 3 AI 智能体 · AI 场景报告导出
//
// 用途：
//   把当前 GIS 场景打包成一份可分享的 Markdown / HTML 报告
//   - 顶部：标题 + 摘要（相机、要素数、图层数）
//   - 主体：每个图层的要素分布、字段、样例
//   - 选区：当前选中要素的字段表
//   - 附图：截图（base64 嵌入）
//   - 选填：AI 生成场景说明（由调用方传入 aiDescription 字符串）
//
// 零新依赖，仅用浏览器原生 Blob/URL。
//
// 输入：
//   sceneContext: aiContext.buildSceneContext 产物
//   options:
//     {
//       title?: string,
//       aiDescription?: string,
//       aiModel?: string,
//       snapshotDataUrl?: string,  // base64 image/png
//       includeSnapshot?: boolean,  // 默认 true
//       format?: 'md' | 'html'     // 默认 'md'
//     }
// 输出：
//   { content: string, mime: string, filename: string }

const DEFAULT_TITLE = 'GIS 场景报告';

function safe(s) {
  if (s == null) return '';
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
}

function fmtBbox(bb) {
  if (!bb || !Number.isFinite(bb[0])) return '';
  const r = (n) => Number(n).toFixed(4);
  return `${r(bb[0])},${r(bb[1])} ~ ${r(bb[2])},${r(bb[3])}`;
}

function fmtVal(v) {
  if (v == null) return '';
  const s = String(v);
  return s.length > 64 ? s.slice(0, 64) + '…' : s;
}

// 把 ctx 拍平成 markdown 章节（共用给 md/html）
function sceneToMarkdown(ctx, opts) {
  const lines = [];
  const title = opts.title || DEFAULT_TITLE;
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> 生成时间：${new Date().toLocaleString()}${opts.aiModel ? ` · AI 模型：${opts.aiModel}` : ''}`);
  lines.push('');

  // 顶部概览表
  const head = ctx.headline || {};
  const cameraInfo = ctx.cameraLon != null
    ? `经度 ${ctx.cameraLon}°, 纬度 ${ctx.cameraLat}°, 高度 ${ctx.cameraHeightM} m`
    : '未就绪';
  const fileCount = (ctx.files || []).length;
  const featureCount = head.featureCount ?? ctx.featureCount ?? 0;
  const layerCount = head.layerCount ?? (ctx.layers || []).filter((l) => l.count > 0).length;
  const selectionCount = head.selectedCount ?? (ctx.selection || []).length;

  lines.push('## 📌 概览');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('| --- | --- |');
  lines.push(`| 相机 | ${cameraInfo} |`);
  lines.push(`| 图层 | ${layerCount} 个非空 |`);
  lines.push(`| 要素 | ${featureCount} 个 |`);
  lines.push(`| 选中 | ${selectionCount} 个 |`);
  lines.push(`| 文件 | ${fileCount} 个 |`);
  lines.push(`| 底图 | ${ctx.imageryLayers || 0} 层 |`);
  lines.push('');

  if (opts.aiDescription) {
    lines.push('## 🤖 AI 场景说明');
    lines.push('');
    lines.push(opts.aiDescription);
    lines.push('');
  }

  if (opts.includeSnapshot !== false && opts.snapshotDataUrl) {
    lines.push('## 📷 视图快照');
    lines.push('');
    lines.push(`![snapshot](${opts.snapshotDataUrl})`);
    lines.push('');
  }

  // 图层列表
  const layers = (ctx.layers || []).filter((l) => l.count > 0);
  if (layers.length) {
    lines.push('## 📐 图层');
    lines.push('');
    for (const l of layers) {
      const kindText = Object.entries(l.kindCount || {})
        .map(([k, v]) => `${k}×${v}`).join(' ') || '?';
      lines.push(`### 「${l.name || l.id}」 · ${l.count} 要素（${kindText}）${l.visible ? '' : ' · 已隐藏'}`);
      if (l.bbox) lines.push(`- 范围：${fmtBbox(l.bbox)}`);
      const fieldList = (l.fields || []).slice(0, 12);
      if (fieldList.length) {
        const fNames = fieldList.map((f) => `\`${f.name}\`:${f.type}`).join(', ');
        const more = (l.fields || []).length > 12 ? ` …共 ${l.fields.length} 字段` : '';
        lines.push(`- 字段：${fNames}${more}`);
      }
      if (l.samples && l.samples.length) {
        for (const s of l.samples) lines.push(`- 样本：${s}`);
      }
      lines.push('');
    }
  } else {
    lines.push('## 📐 图层');
    lines.push('');
    lines.push('_无_');
    lines.push('');
  }

  // 文件
  if (ctx.files && ctx.files.length) {
    lines.push('## 📂 文件');
    lines.push('');
    lines.push('| 名称 | 格式 | 实体数 | 范围 |');
    lines.push('| --- | --- | --- | --- |');
    for (const f of ctx.files) {
      const cnt = f.entityCount != null ? `${f.entityCount}` : (f.loading ? '加载中' : '?');
      lines.push(`| ${f.name} | ${f.format || '?'} | ${cnt} | ${f.bbox ? fmtBbox(f.bbox) : ''} |`);
    }
    lines.push('');
  }

  // 选区
  if (ctx.selection && ctx.selection.length) {
    lines.push('## ✅ 选中要素');
    lines.push('');
    const head2 = ctx.selection.slice(0, 20);
    lines.push('| ID | 类型 | 名称 | 图层 |');
    lines.push('| --- | --- | --- | --- |');
    for (const s of head2) {
      lines.push(`| \`${s.featureId}\` | ${s.kind || ''} | ${s.name || ''} | ${s.layerId || ''} |`);
    }
    if (ctx.selection.length > head2.length) {
      lines.push('');
      lines.push(`_…还有 ${ctx.selection.length - head2.length} 个未列出_`);
    }
    lines.push('');
  }

  // 根实体
  if (ctx.rootEntityCount > 0) {
    const t = Object.entries(ctx.rootTypeCount || {}).map(([k, v]) => `${k}=${v}`).join(', ');
    lines.push('## ✨ 代码/预设生成实体');
    lines.push('');
    lines.push(`- 共 ${ctx.rootEntityCount} 个（${t}）`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`_由 Blog-GIS 自动生成 · ${new Date().toISOString()}_`);
  return lines.join('\n');
}

// md → html（极简自包含）
function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^# /.test(line)) { out.push(`<h1>${inline(line.slice(2))}</h1>`); i++; continue; }
    if (/^## /.test(line)) { out.push(`<h2>${inline(line.slice(3))}</h2>`); i++; continue; }
    if (/^### /.test(line)) { out.push(`<h3>${inline(line.slice(4))}</h3>`); i++; continue; }
    if (/^---$/.test(line)) { out.push('<hr/>'); i++; continue; }
    if (/^>/.test(line)) { out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); i++; continue; }
    if (/^- /.test(line) || /^\* /.test(line)) {
      const items = [];
      while (i < lines.length && /^- |^\* /.test(lines[i])) {
        items.push(lines[i].replace(/^- |^\* /, ''));
        i++;
      }
      out.push('<ul>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\| /.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      if (rows.length >= 2) {
        const [head, sep, ...body] = rows;
        out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>');
        out.push('<tbody>' + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      }
      continue;
    }
    if (/^\s*!\[(.*?)\]\((.+)\)\s*$/.test(line)) {
      const m = line.match(/!\[(.*?)\]\((.+)\)/);
      out.push(`<p><img src="${m[2]}" alt="${m[1]}" style="max-width:100%;border-radius:8px"/></p>`);
      i++; continue;
    }
    if (line.trim() === '') { out.push(''); i++; continue; }
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  return out.join('\n');
}

// 内联：粗体 / 行内代码 / 转义
function inline(s) {
  const safe = String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
  return safe
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const HTML_SHELL = (title, body) =>
`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${safe(title)}</title>
<style>
body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#222;background:#fafafa;margin:0;padding:32px;max-width:960px;margin:0 auto}
h1{margin:0 0 8px;font-size:24px;color:#0e3a5f}
h2{margin:32px 0 12px;font-size:18px;border-bottom:2px solid #5ad1ff;padding-bottom:6px;color:#0e3a5f}
h3{margin:20px 0 8px;font-size:15px;color:#333}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid #5ad1ff;background:#f3fbff;color:#345}
table{border-collapse:collapse;width:100%;margin:8px 0;background:#fff}
th,td{border:1px solid #e0e0e0;padding:6px 10px;text-align:left;font-size:13px}
th{background:#f0f4f8;color:#345}
code{background:#f0f0f0;padding:1px 6px;border-radius:3px;font-size:12px}
hr{margin:32px 0;border:none;border-top:1px dashed #ccc}
ul{padding-left:20px}
img{display:block;margin:8px 0;box-shadow:0 2px 8px rgba(0,0,0,.1)}
@media (prefers-color-scheme:dark){body{background:#1f1f1f;color:#e0e0e0}h2{color:#5ad1ff}table{background:#2a2a2a;color:#e0e0e0}th{background:#333;color:#aaa}blockquote{background:#0e3a5f;color:#cce}}
</style></head><body>${body}</body></html>`;

// 主入口
export function exportSceneReport(sceneContext, options = {}) {
  if (!sceneContext) return null;
  const md = sceneToMarkdown(sceneContext, options);
  if (options.format === 'html') {
    return {
      content: HTML_SHELL(options.title || DEFAULT_TITLE, mdToHtml(md)),
      mime: 'text/html;charset=utf-8',
      filename: (options.title || 'gis-scene').replace(/\s+/g, '-').toLowerCase() + '.html',
    };
  }
  return {
    content: md,
    mime: 'text/markdown;charset=utf-8',
    filename: (options.title || 'gis-scene').replace(/\s+/g, '-').toLowerCase() + '.md',
  };
}

// 把 content 触发下载（浏览器）
export function downloadReport(report) {
  if (!report) return;
  const blob = new Blob([report.content], { type: report.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = report.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
