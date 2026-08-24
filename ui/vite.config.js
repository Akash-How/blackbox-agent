import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// resolve.dedupe: the chat SDK's store runtime (@assistant-ui/tap) must be a
// singleton — a second copy in another pre-bundled chunk makes React's
// useSyncExternalStore see two stores and loop ("getSnapshot should be cached").
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "zustand", "@assistant-ui/tap", "@assistant-ui/core", "@assistant-ui/store", "@assistant-ui/react"],
  },
  server: {
    port: 5199,
    proxy: {
      "/api": { target: "http://localhost:8790", changeOrigin: true },
      "/mcp": { target: "http://localhost:8791", changeOrigin: true },
    },
  },
  preview: {
    port: 5199,
    proxy: {
      "/api": { target: "http://localhost:8790", changeOrigin: true },
      "/mcp": { target: "http://localhost:8791", changeOrigin: true },
    },
  },
});
