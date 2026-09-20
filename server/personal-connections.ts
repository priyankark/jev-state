import type { Request } from "express";
import { z } from "zod";

export const providerSchema = z.enum(["jev", "openai"]);
export type Provider = z.infer<typeof providerSchema>;
export const providerKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(1024)
  .regex(/^[\x21-\x7e]+$/);
export class ConnectionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function personalConnectionsEnabled() {
  return (
    process.env.STUDIO_PUBLIC_DEMO !== "1" && process.env.STUDIO_BYOK === "1"
  );
}
/** Request-scoped only. Never save, log, return, or add these to project data. */
export function personalKeys(req: Request) {
  const keys: { jev?: string; openai?: string } = {};
  for (const provider of ["jev", "openai"] as const) {
    const raw = req.headers[`x-jev-${provider}-key`];
    if (raw === undefined) continue;
    const result = providerKeySchema.safeParse(raw);
    if (!result.success)
      throw new ConnectionError(
        400,
        "A provider key is invalid. Reconnect in Connections.",
      );
    keys[provider] = result.data;
  }
  return keys;
}

const counters = new Map<string, { count: number; expires: number }>();
/** Best-effort per-instance limits; no database or billing dependency. */
export function limitConnections(req: Request, action: "connect" | "live") {
  const now = Date.now();
  for (const [key, counter] of counters)
    if (counter.expires <= now) counters.delete(key);
  // Vercel overwrites this header. Elsewhere, only trust the connection's socket IP.
  const ip = process.env.VERCEL
    ? String(
        req.headers["x-vercel-forwarded-for"] ||
          req.socket.remoteAddress ||
          "unknown",
      )
    : req.socket.remoteAddress || "local";
  const id = `${action}:${ip}`;
  const counter = counters.get(id) ?? { count: 0, expires: now + 60_000 };
  if (!counters.has(id) && counters.size >= 5000)
    throw new ConnectionError(429, "Connections are busy. Try again shortly.");
  counter.count++;
  counters.set(id, counter);
  if (counter.count > (action === "connect" ? 15 : 60))
    throw new ConnectionError(
      429,
      "Too many requests. Please wait a minute and try again.",
    );
}
