import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/studio",
  plugins: [react()],
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { host: "127.0.0.1", fs: { allow: ["."] } },
});
