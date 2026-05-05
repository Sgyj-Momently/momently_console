import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gateway = process.env.VITE_DEV_PROXY_GATEWAY ?? "http://127.0.0.1:18580";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react")
            || id.includes("node_modules/react-dom")
            || id.includes("node_modules/react-router-dom")
            || id.includes("node_modules/@remix-run")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons";
          }
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: gateway,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
          });
        },
      },
    },
  },
});
