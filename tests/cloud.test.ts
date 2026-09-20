import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import {
  encryptCredential,
  decryptCredential,
  entitlement,
  database,
} from "../server/cloud.js";
import { createCloudApi } from "../server/cloud-api.js";
import { blankProject } from "../packages/core/src/studio.js";

test("credentials are encrypted and bound to both account and provider", () => {
  const previous = process.env.CREDENTIAL_ENCRYPTION_KEY;
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    const encrypted = encryptCredential("private-provider-key", "alice", "jev");
    assert.ok(!encrypted.includes("private-provider-key"));
    assert.equal(
      decryptCredential(encrypted, "alice", "jev"),
      "private-provider-key",
    );
    assert.throws(() => decryptCredential(encrypted, "bob", "jev"));
    assert.throws(() => decryptCredential(encrypted, "alice", "openai"));
  } finally {
    if (previous) process.env.CREDENTIAL_ENCRYPTION_KEY = previous;
    else delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  }
});
test("paid access requires an active, unexpired subscription", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(
    entitlement({ subscription_status: "active", paid_until: future })
      .projectLimit,
    100,
  );
  for (const status of ["on_hold", "failed", "cancelled", "expired", "none"])
    assert.equal(
      entitlement({ subscription_status: status, paid_until: future }).plan,
      "free",
    );
  assert.equal(
    entitlement({ subscription_status: "active", paid_until: "2020-01-01" })
      .plan,
    "free",
  );
  assert.equal(
    entitlement({ subscription_status: "active", paid_until: null }).plan,
    "free",
  );
});
test(
  "cloud isolation, atomic project quota, concurrent saves, subscription ordering and rate limits",
  { skip: !process.env.RUN_CLOUD_TESTS },
  async () => {
    const db = database();
    const ids: string[] = [];
    const app = express();
    app.use("/api/studio", createCloudApi());
    const server = createServer(app).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as { port: number };
    const root = `http://127.0.0.1:${address.port}/api/studio`;
    const call = (path: string, token?: string, body?: unknown) =>
      fetch(root + path, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined
          ? {}
          : { method: "POST", body: JSON.stringify(body) }),
      });
    const eventPrefix = `test-${randomUUID()}`;
    try {
      const users = [];
      for (const name of ["alice", "bob"]) {
        const email = `jev-test-${name}-${randomUUID()}@example.com`,
          password = randomBytes(24).toString("base64url");
        const created = await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (created.error) throw created.error;
        ids.push(created.data.user.id);
        const auth = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );
        const login = await auth.auth.signInWithPassword({ email, password });
        if (login.error) throw login.error;
        users.push({
          id: created.data.user.id,
          token: login.data.session!.access_token,
        });
      }
      const [alice, bob] = users as [
        { id: string; token: string },
        { id: string; token: string },
      ];
      assert.equal((await call("/workspace")).status, 401);
      assert.equal((await call("/workspace", "invalid")).status, 401);
      const initial = await (await call("/workspace", alice.token)).json();
      assert.equal(initial.projectLimit, 3);
      const projects = Array.from({ length: 3 }, () => blankProject());
      const library = { projects, conversations: [], reports: [] };
      let r = await call("/workspace", alice.token, { revision: 0, library });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).revision, 1);
      r = await call("/workspace", alice.token, {
        revision: 1,
        library: { ...library, projects: [...projects, blankProject()] },
      });
      assert.equal(r.status, 403);
      const b = await (await call("/workspace", bob.token)).json();
      assert.equal(b.library.projects.length, 0);
      r = await call("/turn", bob.token, {
        project: projects[0],
        currentState: projects[0]!.initial,
        messages: [{ role: "user", content: "hello" }],
        mode: "mock",
      });
      assert.equal(r.status, 403);
      const races = await Promise.all([
        call("/workspace", alice.token, { revision: 1, library }),
        call("/workspace", alice.token, { revision: 1, library }),
      ]);
      assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
      const anon = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
      );
      assert.ok((await anon.from("studio_workspaces").select("*")).error);
      const auth = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
        { global: { headers: { Authorization: `Bearer ${alice.token}` } } },
      );
      assert.ok(
        (
          await auth
            .from("studio_accounts")
            .update({ subscription_status: "active" })
            .eq("user_id", alice.id)
        ).error,
      );
      assert.ok(
        (
          await auth.rpc("studio_save_workspace", {
            p_user: alice.id,
            p_revision: 2,
            p_data: library,
          })
        ).error,
      );
      const customer = `cus-test-${randomUUID()}`;
      assert.equal(
        (
          await db
            .from("studio_accounts")
            .update({ customer_id: customer })
            .eq("user_id", alice.id)
        ).error,
        null,
      );
      const future = new Date(Date.now() + 86400000).toISOString();
      const apply = (event: string, at: string, status: string) =>
        db.rpc("studio_apply_subscription", {
          p_event: eventPrefix + event,
          p_at: at,
          p_customer: customer,
          p_subscription: "sub-" + eventPrefix,
          p_status: status,
          p_until: future,
          p_cancel: false,
        });
      const now = new Date();
      assert.equal(
        (await apply("active", now.toISOString(), "active")).error,
        null,
      );
      r = await call("/workspace", alice.token, {
        revision: 2,
        library: { ...library, projects: [...projects, blankProject()] },
      });
      assert.equal(r.status, 200);
      const cancelTime = new Date(now.getTime() + 1000).toISOString();
      assert.equal(
        (await apply("cancel", cancelTime, "cancelled")).error,
        null,
      );
      assert.equal((await apply("cancel", cancelTime, "active")).data, false);
      assert.equal(
        (await apply("late", now.toISOString(), "active")).data,
        false,
      );
      const summary = await (await call("/billing", alice.token)).json();
      assert.equal(summary.plan, "free");
      const workspace = await (await call("/workspace", alice.token)).json();
      assert.equal(workspace.library.projects.length, 4);
      r = await call("/workspace", alice.token, {
        revision: 3,
        library: workspace.library,
      });
      assert.equal(r.status, 200, "downgraded work remains editable");
      const limits = await Promise.all(
        Array.from({ length: 5 }, () =>
          db.rpc("studio_rate_limit", {
            p_user: alice.id,
            p_action: "test",
            p_limit: 3,
          }),
        ),
      );
      assert.equal(limits.filter((r) => r.data === true).length, 3);
      r = await call("/billing/webhook", undefined, {
        type: "subscription.active",
      });
      assert.equal(r.status, 401);
    } finally {
      await db
        .from("studio_webhook_events")
        .delete()
        .like("event_id", `${eventPrefix}%`);
      for (const id of ids) await db.auth.admin.deleteUser(id);
      server.close();
    }
  },
);
