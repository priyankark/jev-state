import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import OpenAI from "openai";
import { createStudioApi } from "../server/studio-api.js";
import { templates } from "../packages/core/src/studio.js";
import { createConnectorClients } from "../server/conversation.js";
import { limitConnections } from "../server/personal-connections.js";

test("personal connections are request-scoped, isolated from owner credentials, and opt-in", async () => {
  const env = {
    VERCEL: "1",
    STUDIO_BYOK: "1",
    STUDIO_PUBLIC_DEMO: "0",
    STUDIO_ACCESS_TOKEN: "",
    TYPESAFE_API_KEY: "owner-jev-do-not-use",
    OPENAI_API_KEY: "owner-openai-do-not-use",
  };
  const before = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  const supplied: Array<{
    jev?: string | undefined;
    openai?: string | undefined;
  }> = [];
  let calls = 0;
  const app = express();
  app.use(
    "/api/studio",
    createStudioApi({
      verify: async (provider, key) => {
        assert.equal(provider, "jev");
        if (key === "rejected-secret") throw new Error(key);
        assert.equal(key, "personal-jev-secret");
      },
      clients: (keys) => {
        supplied.push({ ...keys });
        return keys.jev
          ? {
              jev: new TypeSafeClient({
                apiKey: keys.jev,
                fetch: async (_url, init) => {
                  calls++;
                  assert.equal(
                    new Headers(init?.headers).get("authorization"),
                    "Bearer personal-jev-secret",
                  );
                  return new Response(
                    JSON.stringify({
                      model: "test-jev",
                      answers: {
                        next_state: {
                          type: "choice",
                          choice: "billing",
                          confidence: 0.95,
                          probabilities: {
                            billing: 1,
                            technical: 0,
                            review: 0,
                            stay: 0,
                          },
                        },
                      },
                      usage: { input_tokens: 10, output_tokens: 5 },
                    }),
                    { headers: { "content-type": "application/json" } },
                  );
                },
              }),
            }
          : {};
      },
    }),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/studio`;
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Jev-Request": "1",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const turn = {
    project: templates[0],
    currentState: "welcome",
    messages: [{ role: "user", content: "charged twice" }],
    mode: "live",
  };
  try {
    const config = await (await fetch(`${base}/connections`)).json();
    assert.equal(config.byok, true);
    assert.equal(config.jev, false);
    assert.equal(config.openai, false);
    assert.equal(config.liveEnabled, true);
    const connected = await post("/connections/key", {
      provider: "jev",
      key: "personal-jev-secret",
      consent: true,
    });
    assert.equal(connected.status, 200);
    assert.equal(connected.headers.get("set-cookie"), null);
    assert.deepEqual(await connected.json(), { ok: true });
    // Verification does not retain credentials or authorize subsequent requests.
    assert.equal((await post("/turn", turn)).status, 401);
    assert.equal(
      (await (await fetch(`${base}/connections`)).json()).jev,
      false,
    );
    const ownHeaders = { "X-Jev-Jev-Key": "personal-jev-secret" };
    const simulation = await post(
      "/turn",
      { ...turn, mode: "mock" },
      ownHeaders,
    );
    assert.equal(simulation.status, 200);
    assert.equal(calls, 0);
    assert.equal(supplied.length, 0);
    const live = await post("/turn", turn, ownHeaders);
    assert.equal(live.status, 200);
    const result = await live.text();
    assert.equal(JSON.parse(result).to, "billing");
    assert.ok(!result.includes("secret"));
    assert.deepEqual(supplied, [{ jev: "personal-jev-secret" }]);
    assert.equal(calls, 1);
    // An OpenAI-only visitor must not borrow the owner's Jev account.
    const incomplete = await post("/turn", turn, {
      "X-Jev-Openai-Key": "personal-openai-secret",
    });
    assert.equal(incomplete.status, 502);
    assert.match((await incomplete.json()).error, /Connect Jev/);
    assert.deepEqual(supplied[1], { openai: "personal-openai-secret" });
    // Generated replies require this visitor's OpenAI key too.
    const project = structuredClone(templates[0]!);
    project.agent.enabled = true;
    const missingOpenAI = await post("/turn", { ...turn, project }, ownHeaders);
    assert.equal(missingOpenAI.status, 502);
    assert.match((await missingOpenAI.json()).error, /OpenAI/);
    assert.equal(calls, 1);
    const evaluation = await post(
      "/eval-case",
      {
        project: templates[0],
        test: {
          ...templates[0]!.cases[0],
          turns: ["charged twice"],
          responseIncludes: "",
          expectedState: "billing",
        },
        mode: "live",
      },
      ownHeaders,
    );
    assert.equal(evaluation.status, 200);
    assert.equal((await evaluation.json()).passed, true);
    assert.equal(
      (await post("/connections/test", { provider: "jev" })).status,
      401,
    );
    const bad = await post("/connections/key", {
      provider: "jev",
      key: "rejected-secret",
      consent: true,
    });
    assert.equal(bad.status, 502);
    assert.ok(!(await bad.text()).includes("rejected-secret"));
    for (const body of [
      { provider: "jev", key: "personal-jev-secret", consent: false },
      { provider: "other", key: "personal-jev-secret", consent: true },
      {
        provider: "jev",
        key: "personal-jev-secret",
        consent: true,
        endpoint: "https://wrong.example",
      },
      { provider: "jev", key: "contains whitespace", consent: true },
    ])
      assert.equal((await post("/connections/key", body)).status, 400);
    assert.equal(
      (
        await post("/turn", turn, {
          ...ownHeaders,
          Origin: "https://wrong.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (await post("/turn", turn, { ...ownHeaders, "X-Jev-Request": "" }))
        .status,
      403,
    );
    assert.equal(
      (await post("/turn", turn, { "X-Jev-Jev-Key": "bad key" })).status,
      400,
    );
    assert.equal((await post("/turn", turn)).status, 401);
    // Even SDK construction without explicit keys cannot pick up environment keys.
    assert.deepEqual(createConnectorClients({}), {});
    process.env.STUDIO_PUBLIC_DEMO = "1";
    const disabled = express();
    disabled.use("/disabled", createStudioApi());
    app.use(disabled);
    assert.equal(
      (
        await fetch(new URL("/disabled/connections/key", base), {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Jev-Request": "1" },
          body: JSON.stringify({
            provider: "jev",
            key: "personal-jev-secret",
            consent: true,
          }),
        })
      ).status,
      403,
    );
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("connection checks are bounded per instance and ignore untrusted forwarding headers", () => {
  const req = {
    headers: { "x-forwarded-for": "one" },
    socket: { remoteAddress: "rate-test-client" },
  } as unknown as express.Request;
  for (let i = 0; i < 15; i++) limitConnections(req, "connect");
  req.headers["x-forwarded-for"] = "another";
  assert.throws(() => limitConnections(req, "connect"), /Too many requests/);
});

test("verification uses authenticated model-list requests for both SDKs without inference", async () => {
  const before = {
    STUDIO_BYOK: process.env.STUDIO_BYOK,
    STUDIO_PUBLIC_DEMO: process.env.STUDIO_PUBLIC_DEMO,
    STUDIO_ACCESS_TOKEN: process.env.STUDIO_ACCESS_TOKEN,
  };
  Object.assign(process.env, {
    STUDIO_BYOK: "1",
    STUDIO_PUBLIC_DEMO: "0",
    STUDIO_ACCESS_TOKEN: "",
  });
  const calls: string[] = [];
  const transport =
    (provider: "jev" | "openai") =>
    async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(init?.method, "GET");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer personal-${provider}-key`,
      );
      assert.equal(init?.body, undefined);
      calls.push(`${provider}:${new URL(String(url)).pathname}`);
      return new Response(
        JSON.stringify(
          provider === "jev"
            ? { models: [{ name: "test-jev" }] }
            : {
                object: "list",
                data: [{ id: "test-openai", object: "model" }],
              },
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    };
  const app = express();
  app.use(
    createStudioApi({
      clients: (keys) => ({
        ...(keys.jev
          ? {
              jev: new TypeSafeClient({
                apiKey: keys.jev,
                fetch: transport("jev"),
              }),
            }
          : {}),
        ...(keys.openai
          ? {
              openai: new OpenAI({
                apiKey: keys.openai,
                fetch: transport("openai"),
              }),
            }
          : {}),
      }),
    }),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const provider of ["jev", "openai"]) {
      const response = await fetch(`${base}/connections/key`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Jev-Request": "1" },
        body: JSON.stringify({
          provider,
          key: `personal-${provider}-key`,
          consent: true,
        }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(response.headers.get("set-cookie"), null);
    }
    assert.deepEqual(calls, ["jev:/v1/models", "openai:/v1/models"]);
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
