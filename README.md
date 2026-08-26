# 🌍 Cesium GIS Editor

独立开源的 GIS 可视化编辑器 — 三维地球 · 代码沙箱 · AI 助手

基于 React + Vite + CesiumJS + Express 构建，支持代码驱动的三维地球场景编辑、矢量数据加载/绘制/编辑、AI 辅助空间分析。

## ✨ 功能

- **三维地球**：CesiumJS 渲染，支持 OSM / Esri / 天地图 / 高德等多种底图
- **代码沙箱**：CodeMirror 编辑器 + 安全执行环境，像 Cesium Sandcastle 一样写代码控制地球
- **矢量编辑器**：点/线/面绘制、顶点编辑、样式面板、图层树、属性表
- **数据加载**：GeoJSON / Shapefile / KML / CSV 拖拽导入
- **空间运算**：buffer / intersect / union / dissolve / centroid / convexHull（服务端 Turf）
- **AI 助手**：多平台大模型代理（OpenAI / Claude / Gemini / DeepSeek / 通义千问 / 智谱 / Moonshot / Minimax / Ollama），支持工具调用（agentic loop）
- **视图分享**：把当前地图视角打包成 URL 分享，附带 AI 生成的场景说明
- **截图导出**：一键截图当前地球画面
- **暗色主题**：默认暗色，支持切换

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- npm

### 安装

```bash
# 克隆仓库
git clone https://github.com/qoqpqpq/cesium-gis-editor.git
cd cesium-gis-editor

# 安装后端依赖
npm install

# 安装前端依赖
cd client && npm install && cd ..

# （可选）配置环境变量
cp .env.example .env
# 编辑 .env 填入 Cesium Ion Token / 天地图 Token（不填也能用）
```

### 开发模式

```bash
# 终端 1：启动后端（端口 3001）
npm run dev

# 终端 2：启动前端 dev server（端口 8080）
npm run client:dev
```

浏览器打开 http://localhost:8080

### 生产构建

```bash
# 构建前端 + 启动服务
npm run build
npm start
```

打开 http://localhost:3001

## 🔑 AI Key 配置

AI 助手采用**纯会话 Key**模式：

1. 点击页面右上角 **🔑** 按钮
2. 选择 AI 平台（OpenAI / Claude / Gemini 等）
3. 输入你的 API Key（可选自定义 Base URL 和模型名）
4. Key **仅存于浏览器内存**，刷新/关闭标签即清除，绝不落盘

后端只做转发代理（绕过浏览器 CORS），不存储任何 Key。

## 🗺️ 底图 Token（可选）

不配置任何 Token 也能用——默认加载 OpenStreetMap 公开底图。

如需更高画质底图：

- **Cesium Ion**：在 [.env](.env) 填 `CESIUM_ION_TOKEN`（申请：https://ion.cesium.com/tokens）
- **天地图**：在 [.env](.env) 填 `TIANDITU_TOKEN`（申请：https://console.tianditu.gov.cn/）

生产环境 Token 走服务端代理下发，浏览器不直接接触凭证。

## 🏗️ 架构

```
client/          # React + Vite 前端
  src/pages/gis/  # GIS 三列页面（代码编辑器 | Cesium 地球 | AI 助手）
  src/components/ # 共享组件（ErrorBoundary / ThemeProvider / AiKeySettings）
  src/api/        # API 层（aiApi / gisApi / spatialApi）
server/          # 精简 Express 后端
  routes/        # ai.js（代理+工具解析）/ gis.js（Token 下发）/ spatial.js（Turf）
  services/       # ai.js（多平台转发）/ spatial.js / ai-prompts.js
  middleware/     # 限流 + 并发控制
```

### 安全设计

- **无数据库**：不存储任何用户数据或 API Key
- **Key 纯会话**：API Key 存浏览器内存，刷新即清，后端不落盘
- **Token 代理**：Cesium/天地图 Token 从服务端 `.env` 读取，按域名白名单下发
- **无 sourcemap**：构建产物不含 `.map` 文件，避免源码泄露
- **CSP**：生产环境启用 Content-Security-Policy，白名单 Cesium/底图/AI 域名
- **限流**：API / AI / 空间运算分级限流，防止配额烧光

## 📝 License

[MIT](LICENSE)
