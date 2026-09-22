import path from "node:path";
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
    alias: {
      vscode: path.resolve(__dirname, "src/__tests__/vscodeTestDouble.ts")
    },
    environment: "jsdom"
  }
});
