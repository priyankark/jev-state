import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Request } from "express";
import { z } from "zod";
import { messageSchema, projectSchema } from "../packages/core/src/studio.js";

export const cloudConfigured = () =>
  process.env.STUDIO_MODE !== "local" &&
  !!(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
let singleton: SupabaseClient | undefined;
export function database() {
  return (singleton ??= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  ));
}
export async function identity(req: Request) {
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return null;
  const { data, error } = await database().auth.getUser(token);
  return error ? null : data.user;
}
export async function account(userId: string) {
  const db = database();
  const init = await db
    .from("studio_accounts")
    .upsert(
      { user_id: userId },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (init.error) throw new Error("Database unavailable");
  const { data, error } = await db
    .from("studio_accounts")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error("Database unavailable");
  return data;
}
export function entitlement(a: {
  subscription_status: string;
  paid_until: string | null;
}) {
  const pro =
    a.subscription_status === "active" &&
    !!a.paid_until &&
    Date.parse(a.paid_until) > Date.now();
  return { plan: pro ? "pro" : "free", projectLimit: pro ? 100 : 3 };
}
function encryptionKey() {
  const key = Buffer.from(
    process.env.CREDENTIAL_ENCRYPTION_KEY || "",
    "base64",
  );
  if (key.length !== 32)
    throw new Error("Credential storage is not configured.");
  return key;
}
export function encryptCredential(
  value: string,
  userId: string,
  provider: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${userId}:${provider}`));
  const content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    content.toString("base64"),
  ].join(".");
}
export function decryptCredential(
  value: string,
  userId: string,
  provider: string,
) {
  const [version, iv, tag, content] = value.split(".");
  if (version !== "v1" || !iv || !tag || !content)
    throw new Error("Invalid credential");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  cipher.setAAD(Buffer.from(`${userId}:${provider}`));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(content, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
export async function credentials(userId: string) {
  const { data, error } = await database()
    .from("studio_credentials")
    .select("provider,encrypted_key")
    .eq("user_id", userId);
  if (error) throw new Error("Database unavailable");
  return Object.fromEntries(
    data.map((r) => [
      r.provider,
      decryptCredential(r.encrypted_key, userId, r.provider),
    ]),
  ) as { jev?: string; openai?: string };
}
const turn = z.object({
  id: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  reply: z.string().max(8000),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number()),
  reason: z.string(),
  model: z.string(),
  agentModel: z.string().nullable(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  elapsedMs: z.number().nonnegative(),
  questions: z.unknown(),
  input: z.unknown(),
  mode: z.enum(["mock", "live"]),
  at: z.string(),
});
const artifact = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(1).max(100),
  projectVersion: z.number().int().positive(),
  createdAt: z.string(),
  mode: z.enum(["mock", "live"]),
});
const conversation = artifact.extend({
  projectSnapshot: projectSchema,
  messages: z.array(messageSchema).max(40),
  turns: z.array(turn).max(20),
});
const report = artifact.extend({
  configSignature: z.string().max(100000),
  results: z
    .array(
      z.object({
        caseId: z.string(),
        name: z.string(),
        expected: z.string(),
        actual: z.string(),
        passed: z.boolean(),
        responsePassed: z.boolean(),
        elapsedMs: z.number().nonnegative(),
        inputTokens: z.number().nonnegative(),
        outputTokens: z.number().nonnegative(),
        turns: z.array(turn).max(5),
        error: z.string().optional(),
      }),
    )
    .max(30),
});
export const librarySchema = z
  .object({
    projects: z.array(projectSchema).max(100),
    conversations: z.array(conversation).max(60),
    reports: z.array(report).max(40),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.projects.map((p) => p.id));
    if (ids.size !== value.projects.length)
      ctx.addIssue({ code: "custom", message: "Project IDs must be unique." });
    for (const item of [...value.conversations, ...value.reports])
      if (!ids.has(item.projectId))
        ctx.addIssue({
          code: "custom",
          message: "History must belong to a project in this workspace.",
        });
  });
