/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  // 모듈 지연 로드(동적 import)가 청크로 나뉘려면 워커도 ES 형식이어야 한다.
  worker: { format: "es" as const },
  // xml2js 가 Node 의 timers·stream 을 쓴다. events 는 같은 이름의 npm 패키지로 풀린다.
  resolve: { alias: { timers: "timers-browserify", stream: "/src/script/shims/stream.ts" } },
  test: { environment: "node" },
}));
