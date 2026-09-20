import { choice, noul, score } from "@typesafe-ai/sdk";
import { defineDecision, defineMachine } from "@jev-state/core";

export const supportDecision = defineDecision({
  id: "classify-ticket",
  version: "support-policy-v1",
  questions: {
    department: choice(
      "Which team should handle the request in `ticket.message`?",
      {
        billing: "Charges, subscriptions, payments, invoices, and refunds.",
        technical:
          "Software failures, errors, login issues, and technical troubleshooting.",
        other:
          "Neither team fits, the request is ambiguous, or there is not enough information to route it.",
      },
    ),
    urgent: noul(
      "Does `ticket.message` describe a time-sensitive problem requiring immediate attention?",
      {
        true: "Explicit deadline, ongoing outage, or a time-sensitive blocked task.",
        false:
          "Routine request without time pressure or a current critical impact.",
      },
    ),
    frustration: score(
      "How much frustration does the customer express in `ticket.message`?",
      [
        "Calm: neutral or polite request without expressed dissatisfaction.",
        "Frustrated: clear dissatisfaction or repeated inconvenience.",
        "Very angry: strong anger, severe complaints, or explicit loss of trust.",
      ],
    ),
  },
  outcomes: {
    billing: { label: "Billing", description: "Payments & subscriptions" },
    technical: { label: "Technical", description: "Bugs & troubleshooting" },
    review: { label: "Human review", description: "Uncertain or unmatched" },
  },
  policy(result, threshold) {
    const answer = result.answers.department;
    if (answer.choice === "other")
      return {
        outcome: "review",
        reason: "No matching team. The request needs human review.",
      };
    if (answer.confidence < threshold)
      return {
        outcome: "review",
        reason: `Confidence ${(answer.confidence * 100).toFixed(1)}% is below the ${(threshold * 100).toFixed(0)}% threshold.`,
      };
    return {
      outcome: answer.choice,
      reason: `${answer.choice === "billing" ? "Billing" : "Technical"} selected with ${(answer.confidence * 100).toFixed(1)}% confidence; ${(threshold * 100).toFixed(0)}% threshold passed.`,
    };
  },
});
export const supportMachine = defineMachine({
  id: "support-routing",
  name: "Support routing",
  version: "1.0.0",
  description: "Turn customer messages into clear next steps.",
  decision: supportDecision,
});
