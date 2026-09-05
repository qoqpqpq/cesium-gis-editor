# 开源推荐 | 在浏览器里写代码、看地球、问 AI —— Cesium GIS Editor

> 一个开源的三维 GIS 可视化编辑器，把「代码沙箱」「矢量编辑器」「多平台 AI 助手」装进了同一个网页。
> 项目地址：https://github.com/qoqpqpq/cesium-gis-editor （MIT 协议）
> 🚀 在线 Demo：https://gisai.top （打开即用，无需安装）

![Cesium GIS Editor 主界面](https://github.com/qoqpqpq/cesium-gis-editor/raw/main/docs/screenshot.png)

---

如果你做过 Cesium 开发，下面这几个场景大概率不陌生：

- 想快速验证一段 Cesium 代码，得本地起 dev server，改一行刷一次页面；
- 想在三维地球上画几个点、线、面，要么开几百 MB 的桌面 GIS 软件，要么自己写一堆 Entity 代码；
- 想跑个缓冲区分析、求交、合并，得临时写 Python 脚本或者装插件；
- 想让 AI 帮忙写 GIS 代码，只能把报错复制到 ChatGPT 网页，来回切换、来回粘贴。

**Cesium GIS Editor** 就是为这些场景做的：不需要安装任何桌面软件，浏览器打开即用，写代码、看地球、问 AI，全部在一屏之内完成。

## 它能做什么

### 🌐 三维地球，开箱即用

基于 CesiumJS 1.113 渲染，默认加载 OpenStreetMap 公开底图——**不配置任何 Token 就能跑**。想换更高画质的底图，页面里填入 Cesium Ion / 天地图 Token 即可，支持 OSM、Esri、天地图、高德等多种底图，坐标读数支持十进制度 / DMS / UTM / MGRS 四种格式。

### 💻 代码沙箱，像 Sandcastle 一样写 Cesium

内置 CodeMirror 编辑器 + 安全执行环境，写代码实时预览，效果跟官方 Cesium Sandcastle 一致。项目自带一批可运行的示例——相机飞行动画、城市引脚标注、空间标注等，复制即可跑，代码跑错了还能一键让 AI 帮你修。

### ✏️ 矢量编辑器，浏览器里的轻量 GIS

点 / 线 / 面 / 矩形 / 圆绘制，支持顶点吸附和自动模式；顶点编辑、Undo/Redo 历史栈、样式面板、图层树、属性表一应俱全。更进一步，它还内置了：

- **测量工具**：距离 / 面积量算
- **属性查询构建器**：多条件组合过滤要素
- **几何简化**：数据抽稀
- **三项检查面板**：位置 / 几何 / 属性质量体检，做分析前先过一遍
- **打印导出**：PNG / PDF / GeoJSON / KML / CSV / Shapefile 六种格式一键导出

### 📦 数据拖进来就能用

GeoJSON / Shapefile / KML / CZML / glTF / GLB / CSV / XLSX 直接拖拽导入，表格文件自动识别经纬度列，加载即入图层树，配合属性表直接查看字段。

### 🧮 空间运算，服务端跑不卡前端

后端基于 Turf.js 提供 buffer、intersect、difference、union、dissolve、centroid、convexHull 七种空间运算，重型计算全部在服务端完成，前端只拿结果。

### 🤖 AI 助手，真正的 agentic loop

这是这个项目最「出格」的地方：它不是把 AI 塞进一个聊天框，而是让 AI **能看见你的场景、能操作你的场景**。

- 支持 **9 大模型平台统一代理**：OpenAI、Claude、Gemini、DeepSeek、通义千问、智谱、Moonshot、MiniMax、Ollama（本地模型也行），SSE 流式输出；
- **读工具**：AI 能主动查图层列表、字段 schema、按属性条件查询要素、看当前选中集和已加载文件——问「这个图层里有多少要素」「帮我统计一下」这类问题，它真的会去查，而不是瞎编；
- **写工具**：AI 可以直接画要素、删要素、改属性、建图层、飞视角——所有修改操作执行前都会弹出**用户确认框**，批准才真正落进场景；
- 支持文本 / 图片附件上传，AI 自动感知当前场景上下文（图层、要素、相机状态）；
- 每次对话实时显示 Token 用量和费用，按各家公开价目核算，花多少钱一目了然。

### 🔗 分享与导出

当前地图视角 + 场景可以打包成一个 URL 分享出去，还附带 AI 生成的场景说明；一键截图当前地球画面。

## 安全设计，也值得说两句

AI 时代大家最担心的就是 Key 泄露，这个项目在这块做得很干净：

- **无数据库**：不存任何用户数据和 API Key；
- **Key 纯会话**：API Key 只存在浏览器内存里，刷新 / 关闭标签即清除，后端不落盘、不存储；
- **Token 代理**：底图 Token 从服务端读取、按域名白名单下发，浏览器不直接接触凭证；
- **CSP + 限流 + 无 sourcemap**：生产环境启用 Content-Security-Policy，API / AI / 空间运算分级限流，构建产物不含 .map 文件。

## 技术栈速览

| 层级 | 技术 |
|------|------|
| 前端 | React 18 · Vite 5 · CesiumJS 1.113 · CodeMirror 6 |
| 数据格式 | GeoJSON / Shapefile / KML / CZML / glTF-GLB / CSV / XLSX |
| 后端 | Node.js · Express 4 · Turf.js 7 |
| 安全 | Helmet + CSP · 限流 · 并发控制 · 密钥脱敏 |
| 数据 | 无数据库，纯会话模式 |

## 一分钟跑起来

```bash
git clone https://github.com/qoqpqpq/cesium-gis-editor.git
cd cesium-gis-editor
npm install
cd client && npm install && cd ..

# 终端 1：后端（端口 3001）
npm run dev
# 终端 2：前端（端口 8080）
npm run client:dev
```

浏览器打开 http://localhost:8080 即可。Node >= 18 就能跑，生产构建 `npm run build && npm start` 单进程托管。

## 写在最后

这个项目把 Cesium 开发中最割裂的三件事——写代码、画矢量、问 AI——收拢到了同一个界面里。不管你是 Cesium 新手想快速试代码，还是 GIS 工程师想省掉桌面软件的重量，都值得把它 clone 下来玩一玩。

MIT 协议，随意使用。如果你觉得它有用，欢迎去 GitHub 点个 Star；有想法或发现 bug，提 issue 和 PR 都可以。

**项目地址：https://github.com/qoqpqpq/cesium-gis-editor**
