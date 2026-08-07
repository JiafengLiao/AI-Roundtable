import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.onnx"],
  optimizeDeps: {
    exclude: ["@huggingface/transformers"]
  },
  worker: {
    format: "es"
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1"
  },
  clearScreen: false
});
