import express from "express";
import { randomUUID } from "node:crypto";
import {
  runInputSchema,
  type RunTrace,
  type TraceStep,
  type DecisionProvider,
} from "@jev-state/core";
import { supportMachine } from "../examples/support-routing/machine.js";
import { createMockProvider } from "./mock.js";
import { createJevProvider } from "@jev-state/typesafe";
import { createTypeSafeClient } from "./typesafe.js";
import { createStudioApi, authorized } from "./studio-api.js";
import { liveEnabled } from "./access.js";

export function createApp(options: {
  port: number;
  liveProvider?: DecisionProvider;
  mockDelay?: number;
}) {
  const app = express();
  app.use("/api/studio", createStudioApi());
  const runs = new Map<
    string,
    {
      trace: RunTrace;
      actor: ReturnType<typeof supportMachine.createActor>;
      listeners: Set<(trace: RunTrace) => void>;
      updated: number;
    }
  >();
  app.disable("x-powered-by");
  app.use("/api", (req, res, next) => {
    const validHosts = [
      `127.0.0.1:${options.port}`,
      `localhost:${options.port}`,
    ];
    if (!validHosts.includes(req.headers.host || "")) {
      res.status(403).json({ error: "Invalid local host" });
      return;
    }
    const origin = req.headers.origin;
    if (origin && !validHosts.some((host) => origin === `http://${host}`)) {
      res.status(403).json({ error: "Cross-origin requests are not allowed" });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    if (!authorized(req)) {
      res.status(401).json({ error: "Unlock this workspace to continue." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.get("/api/config", (_req, res) =>
    res.json({
      manifest: supportMachine.manifest,
      liveAvailable:
        liveEnabled() &&
        !!(options.liveProvider || process.env.TYPESAFE_API_KEY?.trim()),
    }),
  );
  app.post("/api/runs", (req, res) => {
    const input = runInputSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({
        error:
          "Enter a message (1–8000 characters), a valid mode, and a threshold from 0 to 1.",
      });
      return;
    }
    if (input.data.mode === "live" && !liveEnabled()) {
      res
        .status(403)
        .json({ error: "Live providers are disabled on this installation." });
      return;
    }
    for (const [id, run] of runs)
      if (
        Date.now() - run.updated > 60 * 60 * 1000 &&
        run.listeners.size === 0
      ) {
        run.actor.stop();
        runs.delete(id);
      }
    if (
      [...runs.values()].filter(
        (r) => r.actor.getSnapshot().value === "evaluating",
      ).length >= 4
    ) {
      res.status(429).json({
        error: "Four decisions are already running. Wait or cancel one.",
      });
      return;
    }
    if (runs.size >= 100) {
      const oldest = [...runs].find(
        ([, r]) =>
          r.actor.getSnapshot().status === "done" && r.listeners.size === 0,
      );
      if (oldest) runs.delete(oldest[0]);
      else {
        res.status(429).json({
          error: "Run history is full. Restart the local server to clear it.",
        });
        return;
      }
    }
    let provider: DecisionProvider;
    try {
      provider =
        input.data.mode === "mock"
          ? createMockProvider(input.data.scenario, options.mockDelay)
          : (options.liveProvider ?? createJevProvider(createTypeSafeClient()));
    } catch {
      res.status(503).json({
        error: "Live Jev is not configured. Use mock mode or check .env.local.",
      });
      return;
    }
    const trace: RunTrace = {
      schemaVersion: 1,
      machineId: supportMachine.manifest.id,
      machineVersion: supportMachine.manifest.version,
      policyVersion: supportMachine.manifest.policyVersion,
      runId: randomUUID(),
      requestId: randomUUID(),
      mode: input.data.mode,
      createdAt: new Date().toISOString(),
      questions: JSON.parse(JSON.stringify(supportMachine.manifest.questions)),
      steps: [],
    };
    const actor = supportMachine.createActor(
      provider,
      { ticket: { message: input.data.message } },
      input.data.threshold,
    );
    const started = performance.now();
    const run = {
      trace,
      actor,
      listeners: new Set<(trace: RunTrace) => void>(),
      updated: Date.now(),
    };
    runs.set(trace.runId, run);
    actor.subscribe((snapshot) => {
      const state = String(snapshot.value);
      if (trace.steps.at(-1)?.state === state) return;
      const step: TraceStep = {
        sequence: trace.steps.length,
        state,
        at: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - started),
        context: structuredClone(snapshot.context),
      };
      trace.steps.push(step);
      run.updated = Date.now();
      for (const notify of run.listeners) notify(trace);
    });
    actor.start();
    actor.send({ type: "RUN" });
    res.status(201).json(trace);
  });
  app.get("/api/runs/:id", (req, res) => {
    const run = runs.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Run expired or not found" });
      return;
    }
    res.json(run.trace);
  });
  app.get("/api/runs/:id/events", (req, res) => {
    const run = runs.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Run expired or not found" });
      return;
    }
    res.set({
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    // Every event is a full snapshot: reconnects recover without applying duplicate deltas.
    const send = (trace: RunTrace) => {
      res.write(
        `id: ${trace.steps.length - 1}\nevent: snapshot\ndata: ${JSON.stringify(trace)}\n\n`,
      );
    };
    send(run.trace);
    run.listeners.add(send);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      run.listeners.delete(send);
    });
  });
  app.post("/api/runs/:id/cancel", (req, res) => {
    const run = runs.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Run expired or not found" });
      return;
    }
    run.actor.send({ type: "CANCEL" });
    res.json(run.trace);
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown endpoint" }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 413
          ? 413
          : 400;
      res.status(status).json({
        error: status === 413 ? "Request body is too large" : "Invalid request",
      });
    },
  );
  return {
    app,
    close: () => {
      for (const run of runs.values()) run.actor.stop();
      runs.clear();
    },
  };
}
