import DodoPayments from "dodopayments";
import express from "express";
import { account, database, entitlement } from "./cloud.js";

export function paymentClient() {
  return new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
    environment:
      process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
        ? "live_mode"
        : "test_mode",
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY || "",
    timeout: 15000,
    maxRetries: 1,
  });
}
export const billingReady = () =>
  !!(
    process.env.DODO_PAYMENTS_API_KEY &&
    process.env.DODO_PAYMENTS_PRODUCT_ID &&
    process.env.DODO_PAYMENTS_WEBHOOK_KEY &&
    process.env.APP_URL
  );
export function appUrl() {
  const url = new URL(process.env.APP_URL!);
  if (process.env.VERCEL && url.protocol !== "https:")
    throw new Error("APP_URL must use HTTPS");
  return url.origin;
}
export async function billingSummary(userId: string) {
  const a = await account(userId);
  return {
    ...entitlement(a),
    status: a.subscription_status,
    paidUntil: a.paid_until,
    cancelAtPeriodEnd: a.cancel_at_period_end,
    canManage: !!a.customer_id,
    checkoutReady: billingReady(),
    testMode: process.env.DODO_PAYMENTS_ENVIRONMENT !== "live_mode",
  };
}
export function billingWebhook() {
  const router = express.Router();
  router.post(
    "/billing/webhook",
    express.raw({ type: "application/json", limit: "512kb" }),
    async (req, res) => {
      if (!billingReady()) {
        res.status(503).json({ error: "Billing is not configured." });
        return;
      }
      let event;
      try {
        if (!Buffer.isBuffer(req.body)) throw new Error("Raw body required");
        event = paymentClient().webhooks.unwrap(req.body.toString("utf8"), {
          headers: {
            "webhook-id": req.get("webhook-id") || "",
            "webhook-timestamp": req.get("webhook-timestamp") || "",
            "webhook-signature": req.get("webhook-signature") || "",
          },
        });
      } catch {
        res.status(401).json({ error: "Invalid webhook signature." });
        return;
      }
      if (
        !event.type.startsWith("subscription.") ||
        !("subscription_id" in event.data)
      ) {
        res.json({ received: true });
        return;
      }
      try {
        // Fetch current provider state: a delayed event must not restore a cancelled plan.
        const subscription = await paymentClient().subscriptions.retrieve(
          String(event.data.subscription_id),
        );
        if (subscription.product_id !== process.env.DODO_PAYMENTS_PRODUCT_ID) {
          res.json({ received: true });
          return;
        }
        const { error } = await database().rpc("studio_apply_subscription", {
          p_event: req.get("webhook-id"),
          p_at: event.timestamp,
          p_customer: subscription.customer.customer_id,
          p_subscription: subscription.subscription_id,
          p_status: subscription.status,
          p_until: subscription.next_billing_date,
          p_cancel: subscription.cancel_at_next_billing_date,
        });
        if (error) throw error;
        res.json({ received: true });
      } catch {
        res
          .status(503)
          .json({ error: "Subscription sync failed; retry delivery." });
      }
    },
  );
  return router;
}
