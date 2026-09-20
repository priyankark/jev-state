import express from "express";
import { createStudioApi } from "../server/studio-api.js";
const app = express();
app.disable("x-powered-by");
app.use("/api/studio", createStudioApi());
app.use((_req, res) => res.status(404).json({ error: "Unknown endpoint" }));
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const tooLarge =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 413;
    res
      .status(tooLarge ? 413 : 400)
      .json({
        error: tooLarge ? "Request body is too large" : "Invalid request body",
      });
  },
);
export default app;
