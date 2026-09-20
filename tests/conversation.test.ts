import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import OpenAI from "openai";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  templates,
  projectSchema,
  turnRequestSchema,
  type ChatMessage,
} from "../packages/core/src/studio.js";
import { executeTurn, evaluateCase } from "../server/conversation.js";
import { createStudioApi } from "../server/studio-api.js";
const signal = () => new AbortController().signal;
test("multi-turn state transitions preserve conversation context and stop at terminal states", async () => {
  const project = templates[0]!;
  const messages: ChatMessage[] = [
    { role: "user", content: "I was charged twice" },
  ];
  const first = await executeTurn(
    { project, currentState: "welcome", messages, mode: "mock" },
    {},
    signal(),
  );
  assert.equal(first.to, "billing");
  messages.push(
    { role: "assistant", content: first.reply },
    { role: "user", content: "It is fixed now" },
  );
  const second = await executeTurn(
    { project, currentState: first.to, messages, mode: "mock" },
    {},
    signal(),
  );
  assert.equal(second.to, "resolved");
  assert.deepEqual(
    (second.input as { conversation: ChatMessage[] }).conversation,
    messages,
  );
  await assert.rejects(
    () =>
      executeTurn(
        { project, currentState: "resolved", messages, mode: "mock" },
        {},
        signal(),
      ),
    /ended/,
  );
});
test("uncertainty stays in place and evaluation runs the same multi-turn engine", async () => {
  const project = templates[0]!;
  const turn = await executeTurn(
    {
      project,
      currentState: "welcome",
      messages: [{ role: "user", content: "hello" }],
      mode: "mock",
    },
    {},
    signal(),
  );
  assert.equal(turn.to, "welcome");
  assert.match(turn.reason, /below/);
  const result = await evaluateCase(
    project,
    project.cases[0]!,
    "mock",
    {},
    signal(),
  );
  assert.equal(result.passed, true);
  assert.equal(result.turns.length, 2);
  const wrong = await evaluateCase(
    project,
    { ...project.cases[0]!, expectedState: "technical" },
    "mock",
    {},
    signal(),
  );
  assert.equal(wrong.passed, false);
});
test("validates workflow references and alternating messages", () => {
  assert.equal(
    projectSchema.safeParse({
      ...templates[0],
      states: [
        { ...templates[0]!.states[0]!, transitions: ["missing"] },
        templates[0]!.states[1],
      ],
    }).success,
    false,
  );
  assert.equal(
    turnRequestSchema.safeParse({
      project: templates[0],
      currentState: "welcome",
      mode: "mock",
      messages: [{ role: "assistant", content: "hi" }],
    }).success,
    false,
  );
});
test("live adapter passes full history to Jev and OpenAI, and keeps instructions separate", async () => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const jev = new TypeSafeClient({
    apiKey: "test-only",
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          model: "test-jev",
          answers: {
            next_state: {
              type: "choice",
              choice: "billing",
              confidence: 0.95,
              probabilities: { billing: 1, technical: 0, review: 0, stay: 0 },
            },
          },
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const openai = new OpenAI({
    apiKey: "test-only",
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          id: "resp_test",
          object: "response",
          created_at: 1,
          status: "completed",
          model: "test-openai",
          output: [
            {
              type: "message",
              id: "msg_test",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "Which charge should we investigate?",
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const project = structuredClone(templates[0]!);
  project.agent.enabled = true;
  const messages: ChatMessage[] = [
    { role: "user", content: "Hi" },
    { role: "assistant", content: "How can I help?" },
    { role: "user", content: "I was charged twice" },
  ];
  const result = await executeTurn(
    { project, currentState: "welcome", messages, mode: "live" },
    { jev, openai },
    signal(),
  );
  assert.equal(result.to, "billing");
  assert.equal(result.reply, "Which charge should we investigate?");
  assert.equal(result.inputTokens, 30);
  assert.deepEqual(requests[1]!.body.input, messages);
  assert.equal(requests[1]!.body.store, false);
  assert.match(String(requests[1]!.body.instructions), /Billing help/);
});
test("public local API works without an account and blocks foreign origins", async () => {
  const oldToken = process.env.STUDIO_ACCESS_TOKEN,
    oldVercel = process.env.VERCEL;
  delete process.env.STUDIO_ACCESS_TOKEN;
  process.env.VERCEL = "1";
  const app = express();
  app.use("/api/studio", createStudioApi());
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/studio`;
  try {
    assert.equal((await fetch(`${base}/connections`)).status, 200);
    const config = await (await fetch(`${base}/connections`)).json();
    assert.equal(config.liveEnabled, false);
    assert.equal(config.jev, false);
    assert.equal(
      (
        await fetch(`${base}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project: templates[0],
            currentState: "welcome",
            messages: [{ role: "user", content: "hello" }],
            mode: "live",
          }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/connections/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "jev" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/connections`, {
          headers: { Origin: "https://wrong.example" },
        })
      ).status,
      403,
    );
  } finally {
    if (oldToken === undefined) delete process.env.STUDIO_ACCESS_TOKEN;
    else process.env.STUDIO_ACCESS_TOKEN = oldToken;
    if (oldVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = oldVercel;
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("invalid live probability distributions never become a transition", async () => {
  for (const probabilities of [
    { billing: 0.9 },
    { billing: 0.5, technical: 0, review: 0, stay: 0 },
    { billing: 1, technical: 0, review: 0, stay: 0, injected: 0 },
  ]) {
    const jev = new TypeSafeClient({
      apiKey: "test-only",
      fetch: async () =>
        new Response(
          JSON.stringify({
            model: "test",
            answers: {
              next_state: {
                type: "choice",
                choice: "billing",
                confidence: 0.99,
                probabilities,
              },
            },
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    await assert.rejects(() =>
      executeTurn(
        {
          project: templates[0]!,
          currentState: "welcome",
          messages: [{ role: "user", content: "charged twice" }],
          mode: "live",
        },
        { jev },
        signal(),
      ),
    );
  }
});

test("protected hosted workspace requires its access code and then permits simulation", async () => {
  const before = {
    token: process.env.STUDIO_ACCESS_TOKEN,
    vercel: process.env.VERCEL,
  };
  process.env.STUDIO_ACCESS_TOKEN = "test-secret";
  process.env.VERCEL = "1";
  const app = express();
  app.use("/api/studio", createStudioApi());
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/studio`;
  try {
    assert.equal((await fetch(`${base}/connections`)).status, 401);
    const post = (accessCode: string) =>
      fetch(`${base}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });
    assert.equal((await post("wrong")).status, 401);
    const login = await post("test-secret");
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.equal(
      (
        await fetch(`${base}/connections`, {
          headers: { cookie: cookie.split(";")[0]! },
        })
      ).status,
      200,
    );
  } finally {
    for (const [key, value] of [
      ["STUDIO_ACCESS_TOKEN", before.token],
      ["VERCEL", before.vercel],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
