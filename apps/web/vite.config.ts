import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the webview's React app for the VS Code extension: fixed output
// filenames (no content hash) so apps/extension/src/webviewPanel.ts can
// reference them directly without parsing a manifest, output straight into
// the extension package's media/ dir.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../extension/media",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
        chunkFileNames: "chunk-[name].js",
        assetFileNames: (assetInfo) => (assetInfo.name?.endsWith(".css") ? "main.css" : "assets/[name][extname]"),
      },
    },
  },
});
