import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "./src/ui",
  plugins: [react()],
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: "./src/ui/index.html",
      external: ["ws", "vscode"],
      output: {
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
