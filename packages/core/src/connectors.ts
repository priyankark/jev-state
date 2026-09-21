import { TypeSafeClient } from "@typesafe-ai/sdk";
import OpenAI from "openai";
import type { Connectors } from "./conversation.js";

/** Explicit request credentials only: never fall back to environment credentials. */
export function createConnectorClients(keys: {
  jev?: string | undefined;
  openai?: string | undefined;
}): Connectors {
  return {
    ...(keys.jev
      ? {
          jev: new TypeSafeClient({
            apiKey: keys.jev,
            baseURL: "https://api.typesafe.ai",
            timeout: 12000,
            retry: { maxRetries: 1 },
            logLevel: "off",
          }),
        }
      : {}),
    ...(keys.openai
      ? {
          openai: new OpenAI({
            apiKey: keys.openai,
            baseURL: "https://api.openai.com/v1",
            timeout: 25000,
            maxRetries: 1,
            logLevel: "off",
          }),
        }
      : {}),
  };
}
