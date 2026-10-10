import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 8080,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        // 可用 VITE_API_TARGET 覆盖后端地址（默认 3001）。
        // 本机 3001 被占用时：VITE_API_TARGET=http://localhost:3101 npm run dev
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 8080,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2000,
    // 安全：绝不输出 sourcemap（避免源码泄露）
    sourcemap: false,
    minify: 'esbuild',
  },
});
