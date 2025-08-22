import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "./src/ui",
  plugins: [react()],
  build: {
    outDir: "../../dist",
    emptyOutDir: false, // Don't clear dist to preserve extension.js
    sourcemap: true,
    rollupOptions: {
      external: ["ws", "vscode"],
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          utils: ["src/utils/logger.ts"],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
  optimizeDeps: {
    exclude: ["ws"],
  },
});
