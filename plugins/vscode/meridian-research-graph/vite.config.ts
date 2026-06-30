import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/webview",
    emptyOutDir: false,
    rollupOptions: {
      input: "src/webview/main.tsx",
      output: {
        entryFileNames: "main.js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  test: {
    environment: "jsdom"
  }
});
