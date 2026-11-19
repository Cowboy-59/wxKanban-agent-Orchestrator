import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/api"),
      },
      // Tracked banner redirect lives on the server; forward it so /r/:code is
      // clickable in local dev the same way it is in prod (same origin).
      "/r": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "./src"),
      "@client": path.resolve(__dirname, "./src/client"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@server": path.resolve(__dirname, "./src/server"),
    },
  },
  build: {
    outDir: "dist/client",
    sourcemap: true,
    minify: "terser",
  },
  optimizeDeps: {
    rolldownOptions: {
      // Modern optimization options for Rolldown
      // This replaces the deprecated rollupOptions
    },
  },
});
