import { setTimeout } from "node:timers/promises";
import type { DecisionProvider, Evaluation, RunInput } from "@jev-state/core";

/** Explicitly synthetic fixtures, never presented as model inference. */
export function createMockProvider(
  scenario: RunInput["scenario"],
  delay = 850,
): DecisionProvider {
  return {
    async evaluate({ state, signal }) {
      await setTimeout(delay, undefined, { signal });
      if (scenario === "error") throw new Error("Simulated provider failure");
      const message = JSON.stringify(state).toLowerCase();
      const choice = /charg|refund|bill|payment|subscription/.test(message)
        ? "billing"
        : /crash|login|log in|bug|error|broken/.test(message)
          ? "technical"
          : "other";
      const uncertain = scenario === "uncertain";
      const probabilities = uncertain
        ? { billing: 0.45, technical: 0.4, other: 0.15 }
        : {
            billing: choice === "billing" ? 0.94 : 0.03,
            technical: choice === "technical" ? 0.94 : 0.03,
            other: choice === "other" ? 0.94 : 0.03,
          };
      const result: Evaluation = {
        model: "mock-fixture-v1",
        answers: {
          department: {
            type: "choice",
            choice: uncertain ? "billing" : choice,
            confidence: uncertain ? 0.22 : 0.91,
            probabilities,
          },
          urgent: {
            type: "noul",
            noul: /urgent|asap|today|immediately/.test(message) ? 0.93 : 0.12,
          },
          frustration: {
            type: "score",
            score: 0.65,
            confidence: 0.61,
            probabilities: { "0": 0.45, "1": 0.45, "2": 0.1 },
            legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
          },
        },
        usage: { input_tokens: 0, output_tokens: 0 },
      };
      return result;
    },
  };
}
