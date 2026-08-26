import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2020",
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
