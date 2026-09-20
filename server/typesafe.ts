import { TypeSafeClient } from "@typesafe-ai/sdk";

/** Node-only entrypoint. Do not import this module into browser code. */
export function createTypeSafeClient(): TypeSafeClient {
  if (typeof window !== "undefined") {
    throw new Error("TypeSafe credentials must stay on the server.");
  }
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    throw new Error("Set TYPESAFE_API_KEY in .env.local before connecting.");
  }
  // Limit setup checks to the official service, including when shell env overrides the file.
  const baseURL = process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai";
  if (baseURL !== "https://api.typesafe.ai") {
    throw new Error("This development setup expects https://api.typesafe.ai.");
  }
  return new TypeSafeClient({
    baseURL,
    logLevel: "warn",
    timeout: 10_000,
    retry: { maxRetries: 1, maxRetryAfterMs: 5_000 },
  });
}

/** SDK errors may contain request details; report only the category and status. */
export function reportConnectionError(error: unknown): void {
  const status =
    error && typeof error === "object" && "status" in error
      ? error.status
      : undefined;
  const category = error instanceof Error ? error.name : "UnknownError";
  console.error(
    `TypeSafe connection failed (${category}${typeof status === "number" ? `, HTTP ${status}` : ""}).`,
  );
  process.exitCode = 1;
}
