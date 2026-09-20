import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app.js";

const port = Number(process.env.PORT || 5173);
const { app, close } = createApp({ port });
const http = createServer(app);
if (process.argv.includes("--production")) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server: http } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
http.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Jev State is ready at http://localhost:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    close();
    http.close();
    process.exit(0);
  });
