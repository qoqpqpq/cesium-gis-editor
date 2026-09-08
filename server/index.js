// Cesium GIS Editor 后端入口（独立开源精简版）
// - 无数据库、无博客内容、无 admin/webhook/cron
// - 只做：AI 代理（绕 CORS）/ GIS Token 下发 / 服务端空间运算 / 静态托管
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const aiRouter = require("./routes/ai");
const gisRouter = require("./routes/gis");
const spatialRouter = require("./routes/spatial");
// 周期 10 P1-2: client error telemetry（asyncGuard 上报入口）
const telemetryRouter = require("./routes/telemetry");
const {
  apiLimiter,
  aiLimiter,
  spatialLimiter,
  aiDailyLimiter,
} = require("./middleware/rateLimit");
// 周期 6 P1-1: Otel-style Metrics（http_requests_total + http_request_duration_seconds）
const { httpMetricsMiddleware, metricsHandler, metricsOtlpHandler, processMetricsCollector } = require("./middleware/metrics");

const PORT = parseInt(process.env.PORT || "3001", 10);
const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

const ALLOWED = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:8080,http://localhost:3001,http://127.0.0.1:8080,http://127.0.0.1:3001"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.set("trust proxy", 1);

// 周期 4 P0-1: Host header allowlist（防 DNS rebinding 通过 Host 头绕过）
//   仅作用于 /api/* 路径（静态资源 SPA 仍可用任意 Host 防 404）
//   跳过 /assets 静态资源（生产部署用 Nginx 时 Nginx 会重写 host）
const { validateHostHeader } = require("./services/ssrf-guard");
app.use("/api", validateHostHeader);

// 周期 6 P1-1: HTTP metrics 计数 + 耗时直方图（Otel 风格；自研轻量；零依赖）
app.use(httpMetricsMiddleware());
processMetricsCollector();

// 安全响应头（helmet）— Cesium 需要 eval + wasm + 多域名 connect
// 周期 3 P1-1: CSP 全面审计 —— 增加 Permissions-Policy / Cross-Origin-Opener-Policy /
//   Cross-Origin-Resource-Policy / Referrer-Policy / X-Frame-Options DENY
//   对照 OWASP HTTP Headers Cheat Sheet：7 项硬性 + 3 项可选
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // 周期 3 P1-1: COOP same-origin（防 window.opener 侧信道）
    crossOriginOpenerPolicy: { policy: "same-origin" },
    // 周期 3 P1-1: X-Frame-Options DENY（防 clickjacking，与 CSP frameAncestors 互补）
    xFrameOptions: { action: "deny" },
    // 周期 3 P1-1: Referrer-Policy strict-origin-when-cross-origin
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // 周期 3 P1-1: 关闭 COEP = credentialless（Cesium 瓦片来自第三方 CDN，cross-origin-isolate 会破坏）
    crossOriginEmbedderPolicy: false,
    // 周期 3 P1-1: Permissions-Policy —— 关掉所有不需要的浏览器 API
    //   camera/microphone/geolocation/payment/USB/bluetooth/serial/midi/encrypted-media 全 none
    //   accelerometer/gyroscope/magnetometer 全 none（Cesium 用不上）
    //   fullscreen=self（用户主动允许时仍可全屏）
    //   注：helmet 7.x 不直接支持 Permissions-Policy，需手写 header
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
              "'self'",
              "'unsafe-eval'",
              "'wasm-unsafe-eval'",
              "blob:",
            ],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: [
              "'self'",
              // 周期 2 P1-6: 本地开发服务器与回环地址（不影响生产）
              "http://localhost:3001",
              "http://127.0.0.1:3001",
              "http://localhost:8080",
              "http://127.0.0.1:8080",
              "ws://localhost:8080",
              "ws://127.0.0.1:8080",
              "https://*.tianditu.gov.cn",
              "https://*.tianditu.com",
              "https://*.cesium.com",
              "https://api.cesium.com",
              "https://*.arcgisonline.com",
              "https://*.openstreetmap.org",
              "https://tile.openstreetmap.org",
              "https://*.is.autonavi.com",
              "https://*.gaode.com",
              "https://api.github.com",
              "https://*.anthropic.com",
              "https://*.openai.com",
            ],
            workerSrc: ["'self'", "blob:"],
            childSrc: ["'self'", "blob:"],
            frameSrc: ["'self'", "https://cesium.com", "https://sandcastle.cesium.com"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
  }),
);
// 周期 3 P1-1: Permissions-Policy（helmet 7.x 不支持，需手写 header）
// 周期 9 P2-2: 抽到 server/middleware/permissionsPolicy.js（自研；helmet 8.x 验证不输出）
const permissionsPolicy = require("./middleware/permissionsPolicy");
app.use(permissionsPolicy());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("tiny"));

// CORS（仅作用于 /api/* 路由）
const corsMiddleware = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (!isProd) {
      if (
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      ) {
        return cb(null, true);
      }
    }
    if (ALLOWED.includes("*") || ALLOWED.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error("CORS not allowed: " + origin));
  },
  credentials: true,
});

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ success: true, data: { status: "ok", env: NODE_ENV, ts: new Date().toISOString() } });
});

// 周期 6 P1-1: /api/metrics 端点（Prometheus 文本；localhost-only）
app.get("/api/metrics", metricsHandler);
// 周期 7 P0-4: /api/otlp/metrics 端点（OTLP/HTTP JSON；localhost-only）
//   与 Prometheus 端点数据来源一致（同 registry），周期 8+ 评估 Jaeger / Tempo 接入
app.get("/api/otlp/metrics", metricsOtlpHandler);

// 业务路由
app.use("/api", corsMiddleware);
app.use("/api/ai", aiDailyLimiter, aiLimiter, aiRouter);
app.use("/api/gis", apiLimiter, gisRouter);
app.use("/api/spatial", spatialLimiter, spatialRouter);
// 周期 10 P1-2: client error telemetry（localhost-only，asyncGuard 上报入口）
app.use("/api/telemetry", telemetryRouter);

// 托管前端构建产物
const DIST_DIR = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(DIST_DIR)) {
  app.use(
    "/assets",
    express.static(path.join(DIST_DIR, "assets"), {
      maxAge: "1y",
      immutable: true,
    }),
  );
  app.use(
    express.static(DIST_DIR, {
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "public, max-age=30, must-revalidate");
        } else if (/\.(woff2?|ttf|eot|otf|ico|png|jpg|jpeg|webp|svg)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=604800");
        }
      },
    }),
  );
  // SPA fallback
  app.get(/^(?!\/api)[^.]*$/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

// 错误响应过滤
const { redactSecret } = require("./utils/redact");

function bodyParserErrorHandler(err, req, res, next) {
  if (err && err.type && /^entity\./.test(err.type)) {
    const status = err.status || 400;
    const message =
      err.type === "entity.parse.failed"
        ? "请求体 JSON 解析失败，请检查语法"
        : err.type === "entity.too.large"
        ? "请求体过大"
        : err.message || "请求体格式错误";
    return res.status(status).json({ success: false, message });
  }
  if (err && err.type === "encoding.unsupported") {
    return res.status(415).json({ success: false, message: "不支持的请求编码" });
  }
  next(err);
}
app.use(bodyParserErrorHandler);

// 统一错误处理
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const isServerError = status >= 500;
  console.error(`[error] ${req.method} ${req.originalUrl} status=${status}:`, err.message);
  const raw = isServerError
    ? "服务器内部错误，请稍后重试"
    : redactSecret(err.message) || "请求错误";
  res.status(status).json({ success: false, message: raw });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on http://localhost:${PORT}  (env=${NODE_ENV})`);
  if (fs.existsSync(DIST_DIR)) {
    console.log(`[server] serving static from ${DIST_DIR}`);
  } else {
    console.log(`[server] no static dist found (run "npm run build" to build client)`);
  }
});
