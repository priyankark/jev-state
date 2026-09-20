import { supportMachine } from "../examples/support-routing/machine.js";
import { createMockProvider } from "../server/mock.js";
import { defineDecision } from "@jev-state/core";
import { choice } from "@typesafe-ai/sdk";
const actor = supportMachine.createActor(createMockProvider("auto"), {
  ticket: "hello",
});
// @ts-expect-error Only declared events can be sent.
actor.send({ type: "TYPO" });
defineDecision({
  id: "type-test",
  version: "1",
  questions: { route: choice("Route", { yes: null, no: null }) },
  outcomes: { accepted: { label: "Accepted", description: "Accepted" } },
  // @ts-expect-error Policies can only return declared outcomes.
  policy: () => ({ outcome: "undeclared", reason: "No such target" }),
});
