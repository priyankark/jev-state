import express from "express";
import { z } from "zod";
import {
  account,
  credentials,
  database,
  encryptCredential,
  entitlement,
  identity,
  librarySchema,
} from "./cloud.js";
import {
  appUrl,
  billingReady,
  billingSummary,
  billingWebhook,
  paymentClient,
} from "./billing.js";
import { evaluateCase, executeTurn, serverConnectors } from "./conversation.js";
import {
  evalCaseSchema,
  projectSchema,
  turnRequestSchema,
} from "../packages/core/src/studio.js";

export function createCloudApi() {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(billingWebhook());
  router.use(express.json({ limit: "4mb" }));
  router.use((req, res, next) => {
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host)
          throw new Error();
      } catch {
        res.status(403).json({ error: "Use the same workspace origin." });
        return;
      }
    }
    next();
  });
  router.get("/session", async (req, res) => {
    const user = await identity(req);
    res.json({
      mode: "cloud",
      githubEnabled: process.env.GITHUB_AUTH_ENABLED === "true",
      emailSignupEnabled: process.env.EMAIL_AUTH_ENABLED === "true",
      hosted: !!process.env.VERCEL,
      authenticated: !!user,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      user: user ? { id: user.id, email: user.email } : null,
    });
  });
  router.use(async (req, res, next) => {
    const user = await identity(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    res.locals.user = user;
    next();
  });
  router.use(async (_req, res, next) => {
    const { data, error } = await database().rpc("studio_rate_limit", {
      p_user: res.locals.user.id,
      p_action: "api",
      p_limit: 120,
    });
    if (error) {
      res.status(503).json({ error: "Workspace storage is unavailable." });
      return;
    }
    if (!data) {
      res
        .set("Retry-After", "60")
        .status(429)
        .json({ error: "Too many requests. Try again in a minute." });
      return;
    }
    next();
  });
  router.get("/workspace", async (_req, res) => {
    const id = res.locals.user.id;
    const a = await account(id);
    const { data, error } = await database()
      .from("studio_workspaces")
      .select("data,revision")
      .eq("user_id", id)
      .maybeSingle();
    if (error) throw error;
    res.json({
      library: data?.data || { projects: [], conversations: [], reports: [] },
      revision: data?.revision || 0,
      ...entitlement(a),
    });
  });
  router.post("/workspace", async (req, res) => {
    const parsed = z
      .object({
        revision: z.number().int().nonnegative(),
        library: librarySchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || "Invalid workspace.",
      });
      return;
    }
    const { data, error } = await database().rpc("studio_save_workspace", {
      p_user: res.locals.user.id,
      p_revision: parsed.data.revision,
      p_data: parsed.data.library,
    });
    if (error) {
      if (error.message.includes("WORKSPACE_CONFLICT"))
        res.status(409).json({
          error:
            "This workspace changed in another tab. Export your unsynced work, then reload to see the latest version.",
        });
      else if (error.message.includes("PROJECT_LIMIT"))
        res.status(403).json({
          error:
            "Your free plan includes three projects. Remove a project or upgrade to Pro.",
        });
      else
        res.status(503).json({
          error:
            "Cloud save failed. Your unsynced work is still on this device.",
        });
      return;
    }
    res.json({ revision: data });
  });
  router.get("/connections", async (_req, res) => {
    const { data, error } = await database()
      .from("studio_credentials")
      .select("provider")
      .eq("user_id", res.locals.user.id);
    if (error) throw error;
    res.json({
      jev: data.some((r) => r.provider === "jev"),
      openai: data.some((r) => r.provider === "openai"),
      model: "gpt-4.1-mini",
      personal: true,
    });
  });
  router.post("/connections/key", async (req, res) => {
    const parsed = z
      .object({
        provider: z.enum(["jev", "openai"]),
        key: z.string().trim().max(1024),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a valid provider and API key." });
      return;
    }
    const { provider, key } = parsed.data;
    const user_id = res.locals.user.id;
    if (!key) {
      const { error } = await database()
        .from("studio_credentials")
        .delete()
        .eq("user_id", user_id)
        .eq("provider", provider);
      if (error) throw error;
    } else {
      try {
        const clients = serverConnectors({ [provider]: key });
        if (provider === "jev") await clients.jev!.models.list();
        else await clients.openai!.models.list();
      } catch {
        res.status(400).json({
          error:
            "The provider rejected this key or could not be reached. Check it and try again.",
        });
        return;
      }
      const { error } = await database()
        .from("studio_credentials")
        .upsert({
          user_id,
          provider,
          encrypted_key: encryptCredential(key, user_id, provider),
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    }
    res.json({ ok: true });
  });
  router.post("/connections/test", async (req, res) => {
    try {
      const clients = serverConnectors(await credentials(res.locals.user.id));
      if (req.body.provider === "jev" && clients.jev)
        await clients.jev.models.list();
      else if (req.body.provider === "openai" && clients.openai)
        await clients.openai.models.list();
      else {
        res.status(400).json({ error: "Connect this provider first." });
        return;
      }
      res.json({ ok: true });
    } catch {
      res.status(502).json({
        error: "Connection check failed. Check your key and provider account.",
      });
    }
  });
  for (const path of ["/turn", "/eval-case"])
    router.post(path, async (req, res) => {
      const parsed = (
        path === "/turn"
          ? turnRequestSchema
          : z.object({
              project: projectSchema,
              test: evalCaseSchema,
              mode: z.enum(["mock", "live"]),
            })
      ).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || "Invalid request.",
        });
        return;
      }
      const userId = res.locals.user.id;
      const { data: workspace, error: storageError } = await database()
        .from("studio_workspaces")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();
      if (storageError) throw storageError;
      if (
        !workspace?.data.projects.some(
          (p: { id: string }) => p.id === parsed.data.project.id,
        )
      ) {
        res.status(403).json({
          error: "Save this project to your workspace before running it.",
        });
        return;
      }
      const { data: allowed, error: rateError } = await database().rpc(
        "studio_rate_limit",
        { p_user: userId, p_action: "inference", p_limit: 30 },
      );
      if (rateError) throw rateError;
      if (!allowed) {
        res
          .set("Retry-After", "60")
          .status(429)
          .json({ error: "Run limit reached. Try again in a minute." });
        return;
      }
      const controller = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      try {
        const connectors =
          parsed.data.mode === "live"
            ? serverConnectors(await credentials(userId))
            : {};
        const signal = AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(50000),
        ]);
        const result =
          "test" in parsed.data
            ? await evaluateCase(
                parsed.data.project,
                parsed.data.test,
                parsed.data.mode,
                connectors,
                signal,
              )
            : await executeTurn(parsed.data, connectors, signal);
        if (!res.destroyed) res.json(result);
      } catch {
        if (!res.destroyed)
          res.status(502).json({
            error:
              "The run could not complete. Check your provider connections and usage limits, then try again.",
          });
      }
    });
  router.get("/billing", async (_req, res) =>
    res.json(await billingSummary(res.locals.user.id)),
  );
  router.get("/billing/price", async (_req, res) => {
    if (!billingReady()) {
      res.json({ available: false });
      return;
    }
    const product = await paymentClient().products.retrieve(
      process.env.DODO_PAYMENTS_PRODUCT_ID!,
    );
    res.json({ available: true, name: product.name, price: product.price });
  });
  router.post("/billing/checkout", async (_req, res) => {
    if (!billingReady()) {
      res
        .status(503)
        .json({ error: "Paid subscriptions are not available yet." });
      return;
    }
    const user = res.locals.user;
    const a = await account(user.id);
    if (entitlement(a).plan === "pro") {
      res
        .status(409)
        .json({ error: "You already have Pro. Use Manage subscription." });
      return;
    }
    const client = paymentClient();
    const claimed = await database().rpc("studio_claim_checkout", {
      p_user: user.id,
    });
    if (claimed.error) throw claimed.error;
    if (!claimed.data) {
      res.status(409).json({
        error:
          "Checkout is already being prepared. Wait a moment and try again.",
      });
      return;
    }
    try {
      if (
        a.checkout_id &&
        a.checkout_at &&
        Date.parse(a.checkout_at) > Date.now() - 23 * 3600000
      ) {
        const existing = await client.checkoutSessions.retrieve(a.checkout_id);
        if (
          existing.payment_status === "succeeded" ||
          existing.payment_status === "processing"
        ) {
          res.status(409).json({
            error:
              "Your payment is being processed. Refresh your plan shortly; do not pay again.",
          });
          return;
        }
        if (!existing.payment_id && a.checkout_url) {
          res.json({ url: a.checkout_url });
          return;
        }
      }
      let customerId = a.customer_id;
      if (!customerId) {
        const customer = await client.customers.create(
          {
            email: user.email,
            name: user.user_metadata?.full_name || user.email,
            metadata: { jev_user_id: user.id },
          },
          { headers: { "Idempotency-Key": `jev-customer-${user.id}` } },
        );
        const { error } = await database()
          .from("studio_accounts")
          .update({ customer_id: customer.customer_id })
          .eq("user_id", user.id)
          .is("customer_id", null);
        if (error) throw error;
        customerId = (await account(user.id)).customer_id;
      }
      const session = await client.checkoutSessions.create({
        product_cart: [
          { product_id: process.env.DODO_PAYMENTS_PRODUCT_ID!, quantity: 1 },
        ],
        customer: { customer_id: customerId },
        return_url: `${appUrl()}/?billing=return`,
        metadata: { jev_user_id: user.id },
        feature_flags: {
          allow_customer_editing_email: false,
          allow_customer_editing_name: false,
        },
      });
      if (!session.checkout_url) throw new Error("Checkout URL missing");
      const persisted = await database()
        .from("studio_accounts")
        .update({
          checkout_id: session.session_id,
          checkout_url: session.checkout_url,
          checkout_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (persisted.error) throw persisted.error;
      res.json({ url: session.checkout_url });
    } finally {
      await database()
        .from("studio_accounts")
        .update({ checkout_lock_until: null })
        .eq("user_id", user.id);
    }
  });
  router.post("/billing/portal", async (_req, res) => {
    if (!billingReady()) {
      res.status(503).json({ error: "Billing is not configured." });
      return;
    }
    const a = await account(res.locals.user.id);
    if (!a.customer_id) {
      res.status(400).json({ error: "No billing account yet." });
      return;
    }
    const portal = await paymentClient().customers.customerPortal.create(
      a.customer_id,
      { send_email: false, return_url: `${appUrl()}/?billing=return` },
    );
    res.json({ url: portal.link });
  });
  router.post("/account/delete", async (req, res) => {
    const user = res.locals.user;
    if (req.body.email !== user.email) {
      res
        .status(400)
        .json({ error: "Enter your account email to confirm deletion." });
      return;
    }
    const a = await account(user.id);
    if (
      a.subscription_status === "active" ||
      a.subscription_status === "on_hold"
    ) {
      res.status(409).json({
        error:
          "Cancel your subscription in the billing portal and wait for its paid period to end before deleting the account.",
      });
      return;
    }
    const { error } = await database().auth.admin.deleteUser(user.id);
    if (error) throw error;
    res.json({ ok: true });
  });
  router.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(503)
        .json({ error: "This request could not complete. Please try again." });
    },
  );
  return router;
}
