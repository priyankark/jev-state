import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../server/app.js";
import { traceSchema } from "@jev-state/core";

test("local API validates inputs, blocks foreign origins, and recovers SSE snapshots", async () => {
  const options = { port: 0, mockDelay: 40 };
  const { app, close } = createApp(options);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  options.port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${options.port}`;
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post({ message: "" })).status, 400);
    assert.equal((await post({ message: "ticket", threshold: 3 })).status, 400);
    assert.equal(
      (await post({ message: "ticket", apiKey: "must not be accepted" }))
        .status,
      400,
    );
    assert.equal(
      (
        await post(
          { message: "ticket" },
          { Origin: "https://untrusted.example" },
        )
      ).status,
      403,
    );
    const foreignHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = request(
          `${base}/api/config`,
          { headers: { Host: "untrusted.example" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    assert.equal(foreignHost, 403);
    assert.equal((await post({ message: "a".repeat(40000) })).status, 413);
    const response = await post({
      message: "I was charged twice",
      mode: "mock",
    });
    assert.equal(response.status, 201);
    const initial = traceSchema.parse(await response.json());
    assert.equal(initial.steps.at(-1)?.state, "evaluating");
    await delay(80);
    const recovered = traceSchema.parse(
      await (await fetch(`${base}/api/runs/${initial.runId}`)).json(),
    );
    assert.equal(recovered.steps.at(-1)?.state, "billing");
    const controller = new AbortController();
    const events = await fetch(`${base}/api/runs/${initial.runId}/events`, {
      signal: controller.signal,
    });
    const chunk = await events.body!.getReader().read();
    const text = new TextDecoder().decode(chunk.value);
    controller.abort();
    assert.match(text, /event: snapshot/);
    assert.match(text, /"state":"billing"/);
    assert.match(text, /id: 2/);
    assert.equal((await fetch(`${base}/api/runs/not-a-run`)).status, 404);
  } finally {
    close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
