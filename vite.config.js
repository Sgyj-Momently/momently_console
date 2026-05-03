import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gateway = process.env.VITE_DEV_PROXY_GATEWAY ?? "http://127.0.0.1:18580";

export default defineConfig({
  plugins: [react()],
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
