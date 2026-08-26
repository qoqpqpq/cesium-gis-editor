import axios from "axios";

// 在 Vite 代理下可直接走 /api；生产同源部署时也走 /api
const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";

const http = axios.create({
  baseURL,
  timeout: 60000,
});

http.interceptors.response.use(
  (r) => r,
  (err) => {
    // 静默处理请求取消错误，不打印到控制台
    if (
      err?.code === "ERR_CANCELED" ||
      err?.name === "CanceledError" ||
      err?.message?.includes("abort")
    ) {
      return Promise.reject(err);
    }
    const msg = err?.response?.data?.message || err?.message || "请求失败";
    return Promise.reject(new Error(msg));
  },
);

// ---- AI ----
export const aiApi = {
  platforms: () => http.get("/ai/platforms").then((r) => r.data.data),
  chatStreamUrl: () => baseURL + "/ai/chat/stream",
  // Agent 端点：服务端会解析 <tool>...</tool> 标签，回传结构化 toolCalls
  agentStreamUrl: () => baseURL + "/ai/agent?stream=1",
  // 场景 AI 说明：URL 分享场景时附的 markdown
  sceneDescription: (payload) =>
    http
      .post("/ai/scene-description", payload, { timeout: 30000 })
      .then((r) => r.data.data),
  // 系统提示词（从服务端拉取，避免前端硬编码）
  systemPrompts: {
    get: (scope) => http.get(`/ai/system-prompts/${scope}`).then((r) => r.data),
    list: () => http.get("/ai/system-prompts").then((r) => r.data),
  },
};

// ---- GIS（地图 token 服务端代理，避免泄露到浏览器 localStorage） ----
export const gisApi = {
  config: () => http.get("/gis/config").then((r) => r.data.data),
  cesiumToken: () => http.get("/gis/cesium-token").then((r) => r.data.data),
  tdtToken: () => http.get("/gis/tdt-token").then((r) => r.data.data),
};

// ---- 空间运算（服务端 Turf，镜像客户端 7 个 op） ----
// 双 layer：intersect / difference / union / dissolve
// 单 layer：buffer（带 distance）/ centroid / convexHull
export const spatialApi = {
  intersect: (layerA, layerB) =>
    http.post("/spatial/intersect", { layerA, layerB }).then((r) => r.data),
  difference: (layerA, layerB) =>
    http.post("/spatial/difference", { layerA, layerB }).then((r) => r.data),
  union: (layerA, layerB) =>
    http.post("/spatial/union", { layerA, layerB }).then((r) => r.data),
  // groupBy 可选；不传时服务端走 union 等价
  dissolve: (layerA, layerB, groupBy) =>
    http.post("/spatial/dissolve", { layerA, layerB, groupBy }).then((r) => r.data),
  buffer: (layer, distance) =>
    http.post("/spatial/buffer", { layer, distance }).then((r) => r.data),
  centroid: (layer) =>
    http.post("/spatial/centroid", { layer }).then((r) => r.data),
  convexHull: (layer) =>
    http.post("/spatial/convexHull", { layer }).then((r) => r.data),
};

export default http;
