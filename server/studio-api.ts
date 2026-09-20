import express from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  projectSchema,
  turnRequestSchema,
  evalCaseSchema,
} from "../packages/core/src/studio.js";
import { executeTurn, evaluateCase, serverConnectors } from "./conversation.js";
import { liveEnabled, liveDisabledMessage } from "./access.js";

function token() {
  return process.env.STUDIO_ACCESS_TOKEN;
}
function sessionValue() {
  return createHmac("sha256", token() || "local-only")
    .update("jev-state-owner-v1")
    .digest("hex");
}
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function authorized(req: express.Request) {
  if (!token()) return true;
  return (
    !!token() &&
    equal(
      (req.headers.cookie || "")
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("jev_session="))
        ?.slice(12) || "",
      sessionValue(),
    )
  );
}
export function createStudioApi() {
  const router = express.Router();
  router.use(express.json({ limit: "192kb" }));
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !process.env.VERCEL &&
      !/^(localhost|127\.0\.0\.1):\d+$/.test(req.headers.host || "") &&
      (!process.env.STUDIO_ORIGIN ||
        new URL(process.env.STUDIO_ORIGIN).host !== req.headers.host)
    ) {
      res.status(403).json({ error: "Use the local workspace address." });
      return;
    }
    const origin = req.headers.origin;
    if (origin) {
      try {
        const url = new URL(origin);
        if (
          url.host !== req.headers.host ||
          (process.env.STUDIO_ORIGIN && origin !== process.env.STUDIO_ORIGIN)
        ) {
          res.status(403).json({ error: "Use the same workspace origin." });
          return;
        }
      } catch {
        res.status(403).json({ error: "Invalid origin" });
        return;
      }
    }
    next();
  });
  router.get("/session", (req, res) =>
    res.json({ authenticated: authorized(req), hosted: !!process.env.VERCEL }),
  );
  router.post("/login", (req, res) => {
    if (
      !token() ||
      typeof req.body?.accessCode !== "string" ||
      !equal(req.body.accessCode, token()!)
    ) {
      res.status(401).json({ error: "That access code did not match." });
      return;
    }
    res.cookie("jev_session", sessionValue(), {
      httpOnly: true,
      secure:
        !!process.env.VERCEL ||
        process.env.STUDIO_ORIGIN?.startsWith("https://") === true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ ok: true });
  });
  router.post("/logout", (_req, res) => {
    res.clearCookie("jev_session", { path: "/" });
    res.json({ ok: true });
  });
  router.use((req, res, next) => {
    if (!authorized(req)) {
      res.status(401).json({ error: "Unlock this workspace to continue." });
      return;
    }
    next();
  });
  router.get("/connections", (_req, res) =>
    res.json({
      jev: liveEnabled() && !!process.env.TYPESAFE_API_KEY?.trim(),
      openai: liveEnabled() && !!process.env.OPENAI_API_KEY?.trim(),
      liveEnabled: liveEnabled(),
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    }),
  );
  router.post("/connections/test", async (req, res) => {
    if (!liveEnabled()) {
      res.status(403).json({ error: liveDisabledMessage });
      return;
    }
    try {
      const connectors = serverConnectors();
      if (req.body?.provider === "jev") {
        if (!connectors.jev)
          throw new Error("Set TYPESAFE_API_KEY in your server environment.");
        const models = await connectors.jev.models.list();
        res.json({ ok: true, models: models.map((m) => m.name) });
      } else if (req.body?.provider === "openai") {
        if (!connectors.openai)
          throw new Error("Set OPENAI_API_KEY in your server environment.");
        await connectors.openai.models.list();
        res.json({ ok: true });
      } else res.status(400).json({ error: "Unknown provider" });
    } catch {
      res.status(502).json({
        error:
          "Connection check failed. Confirm the server key and provider account access.",
      });
    }
  });
  router.post("/turn", async (req, res) => {
    const parsed = turnRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || "Invalid conversation",
      });
      return;
    }
    if (parsed.data.mode === "live" && !liveEnabled()) {
      res.status(403).json({ error: liveDisabledMessage });
      return;
    }
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const result = await executeTurn(
        parsed.data,
        serverConnectors(),
        AbortSignal.any([controller.signal, AbortSignal.timeout(50000)]),
      );
      if (!res.destroyed) res.json(result);
    } catch (e) {
      if (!res.destroyed) res.status(502).json({ error: safeError(e) });
    }
  });
  router.post("/eval-case", async (req, res) => {
    const parsed = z
      .object({
        project: projectSchema,
        test: evalCaseSchema,
        mode: z.enum(["mock", "live"]),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || "Invalid evaluation case",
      });
      return;
    }
    if (
      !parsed.data.project.states.some(
        (state) => state.id === parsed.data.test.expectedState,
      )
    ) {
      res
        .status(400)
        .json({ error: "The expected state does not exist in this workflow." });
      return;
    }
    if (parsed.data.mode === "live" && !liveEnabled()) {
      res.status(403).json({ error: liveDisabledMessage });
      return;
    }
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const { project, test, mode } = parsed.data;
      const result = await evaluateCase(
        project,
        test,
        mode,
        serverConnectors(),
        AbortSignal.any([controller.signal, AbortSignal.timeout(50000)]),
      );
      if (!res.destroyed) res.json(result);
    } catch (e) {
      if (!res.destroyed) res.status(502).json({ error: safeError(e) });
    }
  });
  return router;
}
function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    [
      "Connect Jev before starting a live conversation.",
      "Configure the OpenAI connection or switch off generated replies.",
      "This conversation has ended. Start a new conversation.",
      "The OpenAI agent did not return a text reply.",
    ].includes(message)
  )
    return message;
  const status =
    error && typeof error === "object" && "status" in error ? error.status : 0;
  if (status === 401 || status === 403)
    return "The provider rejected the server credentials. Check Connections.";
  if (status === 429)
    return "The provider rate or usage limit was reached. Wait a moment or check your account.";
  return "The turn could not complete. Your conversation is unchanged. Check the provider connection and try again.";
}
