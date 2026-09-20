import { assign, createActor as xstateActor, fromPromise, setup } from "xstate";
import type { EntryType, Questions, SystemOneResult } from "@typesafe-ai/sdk";
import {
  evaluationSchema,
  type Evaluation,
  type MachineManifest,
} from "./schema.js";
export * from "./schema.js";

export interface DecisionProvider {
  evaluate(request: {
    state: EntryType;
    questions: Questions;
    signal: AbortSignal;
  }): Promise<Evaluation>;
}
export interface DecisionDefinition<Q extends Questions, O extends string> {
  id: string;
  version: string;
  questions: Q;
  outcomes: Record<O, { label: string; description: string }>;
  policy: (
    result: SystemOneResult<Q>,
    threshold: number,
  ) => { outcome: NoInfer<O>; reason: string };
}
export function defineDecision<
  const Q extends Questions,
  const O extends string,
>(definition: DecisionDefinition<Q, O>) {
  for (const id of Object.keys(definition.outcomes)) {
    if (
      !/^[a-z][a-z0-9_]*$/.test(id) ||
      ["idle", "evaluating", "decided", "failed", "cancelled"].includes(id)
    )
      throw new Error(`Invalid or reserved outcome: ${id}`);
  }
  if (!Object.keys(definition.outcomes).length)
    throw new Error("A decision needs outcomes");
  return definition;
}
interface RuntimeContext {
  input: EntryType;
  threshold: number;
  result: Evaluation | null;
  policy: { outcome: string; reason: string } | null;
  error: string | null;
}
type RuntimeEvent = { type: "RUN" } | { type: "CANCEL" };

/** Flat decision-machine builder. XState owns invocation and stale-result suppression. */
export function defineMachine<
  const Q extends Questions,
  const O extends string,
>(config: {
  id: string;
  name: string;
  version: string;
  description: string;
  decision: DecisionDefinition<Q, O>;
}) {
  const { decision } = config;
  const outcomes = Object.entries<{ label: string; description: string }>(
    decision.outcomes,
  );
  const manifest: MachineManifest = {
    id: config.id,
    name: config.name,
    version: config.version,
    description: config.description,
    policyVersion: decision.version,
    questions: decision.questions,
    nodes: [
      {
        id: "idle",
        label: "Ready",
        description: "Waiting for a ticket",
        kind: "initial",
        x: 275,
        y: 30,
      },
      {
        id: "evaluating",
        label: "Evaluate ticket",
        description: `${Object.keys(decision.questions).length} judgments · one request`,
        kind: "decision",
        x: 275,
        y: 205,
      },
      ...outcomes.map(([id, meta], i) => ({
        id,
        ...meta,
        kind: "outcome" as const,
        x: 25 + i * 250,
        y: 420,
      })),
      {
        id: "failed",
        label: "Failed",
        description: "Provider or validation error",
        kind: "error",
        x: 150,
        y: 605,
      },
      {
        id: "cancelled",
        label: "Cancelled",
        description: "Request interrupted",
        kind: "error",
        x: 400,
        y: 605,
      },
    ],
    edges: [
      { source: "idle", target: "evaluating", label: "RUN" },
      ...outcomes.map(([id]) => ({
        source: "evaluating",
        target: id,
        label: id === "review" ? "fallback" : `→ ${id}`,
      })),
      { source: "evaluating", target: "failed", label: "onError" },
      { source: "evaluating", target: "cancelled", label: "CANCEL" },
    ],
  };
  function createActor(
    provider: DecisionProvider,
    input: EntryType,
    threshold = 0.8,
  ) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
      throw new Error("Threshold must be between zero and one");
    const logic = setup({
      types: { context: {} as RuntimeContext, events: {} as RuntimeEvent },
      actors: {
        evaluate: fromPromise(
          async ({
            input: request,
            signal,
          }: {
            input: RuntimeContext;
            signal: AbortSignal;
          }) => {
            const result = evaluationSchema.parse(
              await provider.evaluate({
                state: structuredClone(request.input),
                questions: decision.questions,
                signal,
              }),
            );
            for (const [id, question] of Object.entries(decision.questions)) {
              const answer = result.answers[id];
              if (!answer || answer.type !== question.type)
                throw new Error("Provider answer does not match the question");
              if (
                question.type === "choice" &&
                answer.type === "choice" &&
                (!(answer.choice in question.criteria) ||
                  Object.keys(question.criteria).some(
                    (key) => !(key in answer.probabilities),
                  ))
              )
                throw new Error("Invalid choice response");
            }
            const policy = decision.policy(
              result as SystemOneResult<Q>,
              request.threshold,
            );
            if (!Object.hasOwn(decision.outcomes, policy.outcome))
              throw new Error("Policy returned an unknown outcome");
            return { result, policy };
          },
        ),
      },
    }).createMachine({
      id: config.id,
      initial: "idle",
      context: {
        input: structuredClone(input),
        threshold,
        result: null,
        policy: null,
        error: null,
      },
      states: {
        idle: { on: { RUN: "evaluating", CANCEL: "cancelled" } },
        evaluating: {
          on: { CANCEL: "cancelled" },
          invoke: {
            src: "evaluate",
            input: ({ context }) => context,
            onDone: {
              target: "decided",
              actions: assign(({ event }) => event.output),
            },
            onError: {
              target: "failed",
              actions: assign({
                error: () =>
                  "The decision could not complete. Check the connection or try again.",
              }),
            },
          },
        },
        decided: {
          always: outcomes.map(([id]) => ({
            guard: ({ context }: { context: RuntimeContext }) =>
              context.policy?.outcome === id,
            target: id,
          })),
        },
        ...Object.fromEntries(
          outcomes.map(([id]) => [id, { type: "final" as const }]),
        ),
        failed: { type: "final" },
        cancelled: { type: "final" },
      },
    });
    return xstateActor(logic);
  }
  return { manifest, createActor };
}
