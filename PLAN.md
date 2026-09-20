# Implementation status — 2026-09-20

The original plan below is retained as design history. Implemented: visual flat-state workflows, multi-turn conversations, OpenAI Responses connection, deterministic evaluations, Supabase accounts/cloud storage, encrypted tenant credentials, three-free-project quotas, Dodo subscriptions in test mode, Vercel deployment, and MIT licensing. Remaining: teams, nested/parallel states, remote MCP/Agents SDK connectors, model-graded evals and durable background execution. See README for current behavior.

# Jev State: implementation plan

Original prototype status: the first runnable slice covered the decision runtime, studio graph/inspector, mock and live execution, cancellation, and snapshot trace import/export/replay. The reusable builder currently supports one decision per flat machine. Multi-step and nested charts, reusable UI packages, redaction hooks, and publication remain follow-up work. See README.md to test the implementation.

## Product goal

Give developers an XState-like way to declare, execute, and inspect state machines whose transitions can depend on Jev judgments. A developer should be able to answer: **What state is my workflow in, what evidence did Jev see, and why did this transition happen?**

Start with a TypeScript library and a local visualizer. The first milestone is a support-ticket machine that routes requests to billing, technical support, or review and makes its entire decision path inspectable.

## Recommended foundation

Use XState v5 as the initial execution engine behind a small Jev-focused API. It already provides statecharts, actors, snapshots, and lifecycle semantics. Build the Jev abstractions and inspection experience here; evaluate a standalone interpreter only if concrete requirements justify it. This is a proposed implementation choice, not a promise of full XState API compatibility.

The core distinction is between **workflow state** (active nodes and context), **inference input** (a selected, immutable snapshot sent to Jev), and **judgments** (typed answers used by deterministic transition policies). Model calls are asynchronous actors, not asynchronous guards. Guards evaluate completed answers synchronously.

Proposed components:

| Component | Responsibility |
| --- | --- |
| `packages/core` | Typed machine definitions, XState adapter, decision lifecycle, snapshots, inspection protocol |
| `packages/typesafe` | Server-only TypeSafe SDK adapter, question batching, cancellation and error normalization |
| `packages/react` | React subscription hooks and optional inspector embedding, after the first slice works |
| `apps/studio` | React + Vite + React Flow graph, inspector panels, timeline and replay controls |
| `apps/server` | Local Node server with validated execution endpoints and SSE inspection events |
| `examples/support-routing` | Runnable example and representative evaluation fixtures |

Use npm workspaces when these packages are introduced. The initial environment stays small until implementation starts. SQLite persistence, accounts, hosted collaboration, and databases are unnecessary for the first slice.

## Developer experience

Proposed public API: `defineMachine`, `createActor`, `defineDecision`, `subscribe`, `send`, `getSnapshot`, and `inspect`. Names and signatures should be validated through the working example before publication.

Definitions contain typed context, a discriminated event union, initial and terminal states, transitions, named actions/guards, and decision nodes. Decision nodes define an input selector, a map of typed questions, a deterministic outcome policy, and explicit error/uncertainty targets. Use the official SDK's question constructors instead of inventing a competing question format.

The source of truth is code. Produce a versioned serializable graph manifest for rendering; keep executable callbacks in a registry. Do not stringify functions or execute arbitrary source received from a browser. Start with visualization and simulation; graph editing and code round-tripping follow later.

Illustrative decision specification (proposed API, not implemented):

```ts
const route = defineDecision({
  input: ({ context }) => ({ ticket: context.ticket }),
  questions: {
    department: choice('Which team should handle `ticket`?', {
      billing: 'Charges, invoices, and refunds',
      technical: 'Bugs and technical troubleshooting',
      other: 'Neither team is suitable, or the request lacks enough detail',
    }),
  },
  // Versioned policy code maps the answer to a finite outcome.
  policy: 'support-routing-v1',
  outcomes: ['billing', 'technical', 'review'],
  onError: 'failed',
});
```

Policies consume raw answers. Choice selects among alternatives; Noul supplies a yes probability; Score rates a dimension. A Noul does not have a separate confidence field. Keep probability distributions visible, and label example thresholds as tunable policy values rather than universal correctness guarantees.

## First visualizer

Three primary areas:

1. **Graph:** states and transitions; current state; pending decision; last traversed edge; distinct error and review paths; fit/zoom and automatic layout.
2. **Inspector:** selected state or transition, context before/after, exact projected input and question definitions, raw answers/distributions, threshold evaluation, resolved model, elapsed time, and token usage when supplied.
3. **Run timeline:** send typed sample events, step through completed transitions, inspect failures, reset a run, and replay recorded decisions without new API calls or side effects.

The UI should explain a transition with evidence such as “billing selected; policy threshold passed,” not invented model reasoning. Keyboard navigation and textual state/transition lists must make the graph usable without relying solely on color or spatial position.

## Runtime contract

- Every run has a run ID and monotonically increasing sequence number. Every decision has a request ID and the originating context revision.
- Expose `idle → evaluating → resolved | uncertain | failed | cancelled` for decisions; workflow states remain developer-defined.
- On leaving a decision state, cancel its request where supported. Discard a response if its state activation or input revision is no longer current, even if transport cancellation fails.
- Process external events in order. Define which events can interrupt a pending decision; do not launch duplicate calls implicitly on every render/context update.
- Batch independent questions over the same snapshot in one request. Dependent questions need an explicit later decision node.
- Keep retries bounded and owned by the adapter/SDK; do not stack automatic retries at several layers. Distinguish provider failure from model uncertainty.
- Record the graph schema version, machine/policy version, input snapshot, question definitions, raw answers, selected transition, and model returned by the service. Allow app-supplied redaction and make raw trace persistence opt-in.
- Replay consumes recorded answers and suppresses external actions. A fresh inference run is a separate operation; do not promise identical outputs from a moving model alias.
- The server owns credentials and executes known machine definitions. The browser receives a manifest, validated snapshots, and trace events. Bind the initial server to loopback, validate request bodies and origins, and limit payload sizes before exposing inference endpoints.

## Delivery sequence and acceptance checks

### 0. Plan and environment — this task

- Document architecture, scope, proposed API and validation criteria.
- Install TypeScript, the official TypeSafe SDK, XState, and a TypeScript script runner with locked dependencies.
- Create ignored local credentials, a safe example environment file, an account/model check, and a tiny live inference check.
- Use the signed-in developer console to obtain a dedicated project key if needed, capture account limits relevant to development, and verify connectivity. Record what is actually verified separately from public documentation defaults.

### 1. Executable vertical slice

- Implement the machine/decision contract using XState actors and a mock provider.
- Add the live TypeSafe adapter and support-routing example: `idle → evaluating → billing | technical | review | failed`.
- Support reset/cancel, event validation, an unknown/no-match path, and snapshots.
- Acceptance: the example runs from Node, works without credentials in mock mode, and exposes a complete trace for a live decision.
- Checks: event ordering, error vs uncertainty, stale results after cancel/reset, threshold boundaries, and typed invalid-event/target rejection.

### 2. Visual inspection

- Build the studio shell and graph manifest adapter; stream inspection events from the local server.
- Add state highlighting, event controls, context diffs, raw question/answer details, distributions, and readable policy outcomes.
- Acceptance: a developer can send an event and explain the resulting transition entirely from the inspector. Browser assets and network responses contain no API key.
- Checks: graph/runtime state agreement, reconnect snapshots plus event sequence handling, and one browser test of the end-to-end mock scenario.

### 3. Reproducible debugging

- Add trace import/export, replay, fixtures, model/machine version display, and policy comparison using saved judgments.
- Acceptance: replay reproduces transitions with zero provider requests and no repeated side effects. Invalid or incompatible trace versions fail clearly.
- Checks: replay equivalence, redaction behavior, malformed input/trace rejection, and safe action suppression.

### 4. Library hardening and release

- Separate reusable packages, publish documentation and migration examples, and add optional React hooks.
- Expand to nested/parallel visualization and invoked actors after flat-machine behavior is stable; XState support underneath does not imply visualizer support until tested.
- Add representative labeled evaluation cases for decision quality, track latency/token usage, and calibrate policy thresholds for the example.
- Acceptance: install into a second app, run the example in mock/live modes, inspect it without modifying application logic, and pass package export/type tests.

## Deferred scope

Drag-and-drop authoring, arbitrary natural-language machine generation, full XState API parity, collaborative editing, hosted execution, durable distributed workflows, billing, and production deployment. Keep these out of the first milestone so the decision lifecycle and inspection model can be proven first.

## Decisions to revisit after the first slice

- Do developers prefer a thin XState extension or a dedicated Jev DSL? Validate with the runnable API rather than designing a new interpreter up front.
- Is this primarily a standalone local studio or an embeddable devtools panel? Start standalone; share its renderer.
- Which real user workflow should replace the support-routing demo for threshold evaluation?

## Sources consulted

Current documentation consulted on 2026-09-19; recheck before each integration milestone:

- [TypeSafe documentation index](https://docs.typesafe.ai/llms.txt)
- [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md) and [client configuration](https://docs.typesafe.ai/sdk/javascript/api/interfaces/TypeSafeClientConfig.md)
- [HTTP API](https://docs.typesafe.ai/api.md), [Choice](https://docs.typesafe.ai/primitives/choice.md), and [confidence](https://docs.typesafe.ai/confidence.md)
- [Models and limits](https://docs.typesafe.ai/models.md); published limits are dynamic, not verified account entitlements.
- [Function calling cookbook](https://docs.typesafe.ai/cookbooks/function_calling.md)
- [XState](https://stately.ai/docs/xstate)


## Product-preview expansion

Implemented a project-first workspace with three explicitly labeled copyable examples, an editable flat-state workflow builder, multi-turn conversations, per-project OpenAI Responses configuration, a protected server-side connection screen, deterministic multi-turn evaluations, and Vercel hosting. Full conversation snapshots and workflow versions support inspection after edits; reports flag stale configuration signatures.

Next product milestones: durable cloud storage and user/team identities; secure credential management per tenant; remote Agents SDK/MCP connectors; nested/parallel statecharts; background eval queues, reusable datasets, and model-graded evaluation. The current preview intentionally discloses device-local storage and unsupported connectors.
