import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { DecisionProvider } from "@jev-state/core";

/** Server-only adapter; never import into a browser entrypoint. */
export function createJevProvider(client: TypeSafeClient): DecisionProvider {
  if (typeof window !== "undefined")
    throw new Error("Jev provider must run on the server");
  return {
    async evaluate({ state, questions, signal }) {
      return client.systemOne({ state, questions }, { signal });
    },
  };
}
