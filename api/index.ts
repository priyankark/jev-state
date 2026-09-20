import express from "express";
import { createStudioApi } from "../server/studio-api.js";
const app = express();
app.disable("x-powered-by");
app.use("/api/studio", createStudioApi());
app.use((_req, res) => res.status(404).json({ error: "Unknown endpoint" }));
app.use(
  (
    _error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(400).json({ error: "Invalid request body" }),
);
export default app;
