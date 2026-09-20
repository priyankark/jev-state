import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  supportMachine,
  supportDecision,
} from "../examples/support-routing/machine.js";
import { createMockProvider } from "../server/mock.js";
import {
  traceSchema,
  type Evaluation,
  type DecisionProvider,
} from "@jev-state/core";

const input = { ticket: { message: "I was charged twice" } };
async function fixture() {
  return createMockProvider("auto", 0).evaluate({
    state: input,
    questions: supportDecision.questions,
    signal: new AbortController().signal,
  });
}
async function finished(actor: ReturnType<typeof supportMachine.createActor>) {
  return new Promise<ReturnType<typeof actor.getSnapshot>>(
    (resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Machine did not finish")),
        2000,
      );
      actor.subscribe((s) => {
        if (s.status === "done") {
          clearTimeout(timer);
          resolve(s);
        }
      });
      actor.start();
      actor.send({ type: "RUN" });
    },
  );
}
test("routes a ticket and retains complete typed judgments", async () => {
  const snapshots: string[] = [];
  const actor = supportMachine.createActor(
    createMockProvider("auto", 0),
    input,
  );
  actor.subscribe((s) => snapshots.push(String(s.value)));
  const result = await finished(actor);
  assert.equal(result.value, "billing");
  assert.deepEqual(snapshots, ["idle", "evaluating", "billing"]);
  assert.equal(result.context.result?.answers.urgent?.type, "noul");
  assert.equal(result.context.result?.answers.frustration?.type, "score");
});
test("threshold boundary passes at equality and falls back immediately below it", async () => {
  const result = await fixture();
  assert.equal(
    supportDecision.policy(result as never, 0.91).outcome,
    "billing",
  );
  assert.equal(
    supportDecision.policy(result as never, 0.91001).outcome,
    "review",
  );
});
test("no-match and low-confidence decisions use review; provider failures use failed", async () => {
  const noMatch = await finished(
    supportMachine.createActor(createMockProvider("auto", 0), {
      ticket: { message: "Hello there" },
    }),
  );
  const uncertain = await finished(
    supportMachine.createActor(createMockProvider("uncertain", 0), input),
  );
  const failed = await finished(
    supportMachine.createActor(createMockProvider("error", 0), input),
  );
  assert.equal(noMatch.value, "review");
  assert.equal(uncertain.value, "review");
  assert.equal(failed.value, "failed");
  assert.ok(failed.context.error);
  assert.equal(uncertain.context.error, null);
});
test("cancellation aborts invocation and ignores a provider that resolves late", async () => {
  let resolve!: (result: Evaluation) => void;
  let signal: AbortSignal | undefined;
  const provider: DecisionProvider = {
    evaluate(request) {
      signal = request.signal;
      return new Promise((r) => (resolve = r));
    },
  };
  const actor = supportMachine.createActor(provider, input);
  actor.start();
  actor.send({ type: "RUN" });
  actor.send({ type: "CANCEL" });
  assert.equal(signal?.aborted, true);
  assert.equal(actor.getSnapshot().value, "cancelled");
  resolve(await fixture());
  await delay(10);
  assert.equal(actor.getSnapshot().value, "cancelled");
  assert.equal(actor.getSnapshot().context.result, null);
});
test("repeated RUN cannot duplicate requests or mutate the captured input", async () => {
  let calls = 0;
  const data = structuredClone(input);
  const provider: DecisionProvider = {
    async evaluate() {
      calls++;
      await delay(10);
      return fixture();
    },
  };
  const actor = supportMachine.createActor(provider, data);
  data.ticket.message = "Changed after creation";
  const completion = finished(actor);
  actor.send({ type: "RUN" });
  await completion;
  assert.equal(calls, 1);
  assert.deepEqual(actor.getSnapshot().context.input, input);
});
test("invalid provider output becomes a sanitized failure", async () => {
  const result = await fixture();
  delete result.answers.department;
  const actor = supportMachine.createActor(
    {
      async evaluate() {
        return result;
      },
    },
    input,
  );
  const output = await finished(actor);
  assert.equal(output.value, "failed");
  assert.equal(output.context.result, null);
});
test("rejects invalid thresholds and malformed traces", () => {
  assert.throws(() =>
    supportMachine.createActor(createMockProvider("auto"), input, NaN),
  );
  assert.throws(() => traceSchema.parse({ schemaVersion: 2 }));
});
