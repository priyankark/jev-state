# Runtime, files, and API

## Architecture

The React application owns editing and browser persistence. React Flow renders the graph. Shared Zod schemas validate project files, API requests, and workspace backups. The Express/Vercel API executes turns using TypeSafe, XState, and optional OpenAI replies. No Studio workspace database is required.

`packages/core/src/conversation.ts` is the shared engine for interactive conversations, browser evaluations, CLI evaluations, and generated projects. `server/conversation.ts` adds the hosted operator-key access boundary; `packages/core/src/connectors.ts` constructs clients only from explicit keys. Each turn constructs a flat XState machine from the project's allowed transitions, starts it at the supplied current state, applies the validated choice if it passes the threshold, and stops the actor. The browser retains history between turns. This is not a durable long-running actor service.

The code-first runtime in `packages/core/src/index.ts` is a separate single-decision abstraction: a persistent actor owns one invocation, cancellation, policy selection, and a final outcome.

## Project format

Use [an example file](../examples/workflows/example-support.json) as the complete executable reference. `projectSchema` in [`studio-schema.ts`](../packages/core/src/studio-schema.ts) (re-exported by `studio.ts`) is authoritative.

| Field                       | Meaning                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `id`, `name`, `description` | Project identity and display metadata                             |
| `instructions`              | Routing policy passed to Jev                                      |
| `initial`                   | Existing state ID where each conversation begins                  |
| `threshold`                 | Required Choice confidence, inclusive, from 0 to 1                |
| `states`                    | 2–12 states with stable IDs and allowed destinations              |
| `agent`                     | `enabled`, Responses `model`, and reply-generation `instructions` |
| `version`, `createdAt`      | Workflow version and creation metadata                            |
| `cases`                     | Up to 30 independent evaluation cases                             |

A state has `id`, `label`, `description` (entry criterion), `reply`, `keywords` (simulation only), `transitions` (destination IDs), `terminal`, and optional `position: {x, y}`. IDs begin with a lowercase letter and contain lowercase letters, digits, underscores, or hyphens, up to 40 characters. Reserved IDs include `stay`, `constructor`, and `prototype`. IDs and outgoing destinations must be unique; references must exist. End states cannot have outgoing transitions. Every state can implicitly stay in place.

Criteria currently belong to the destination state, so all incoming edges share that criterion. Per-edge criteria and executable guards are not available. Position changes do not alter the behavioral signature. Case changes alter the evaluation signature without changing conversation behavior.

Studio exports wrap the project; raw project JSON is also accepted by project import and the CLI. Workspace backups have `{ "schemaVersion": 1, "workspace": { "projects": [], "conversations": [], "reports": [] } }`. Backups validate all history before replacing data. Project files and workspace backups are different formats; only backups restore history.

## Studio HTTP API

The API is same-origin and uses JSON. Default local base: `http://localhost:5173/api/studio`. A protected installation requires the session cookie obtained through `/login`. With `STUDIO_BYOK=1` (and demo mode off), personal keys are accepted for verification and per-request live use. They are never stored. `apps/studio/src/personal-keys.ts` holds keys outside persisted workspace state.

| Method/path              | Body                                                | Result                                                                                             |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /session`           | —                                                   | `authenticated`, `hosted`                                                                          |
| `POST /login`            | `{accessCode}`                                      | HTTP-only session cookie                                                                           |
| `POST /logout`           | —                                                   | Clears session cookie                                                                              |
| `GET /connections`       | —                                                   | Operator `jev`, `openai`, `sources`, `model`, `liveEnabled`, `byok` flags; no personal credentials |
| `POST /connections/key`  | `{provider: "jev" or "openai", key, consent: true}` | Verifies account access; returns `{ok: true}` without storing a key or setting a cookie            |
| `POST /connections/test` | `{provider: "jev" or "openai"}`                     | Checks configured provider access                                                                  |
| `POST /turn`             | `{project, currentState, messages, mode}`           | One `TurnResult`                                                                                   |
| `POST /eval-case`        | `{project, test, mode}`                             | One `CaseResult`                                                                                   |

When BYOK is enabled, connection POSTs and live requests require `X-Jev-Request: 1`. The browser sends personal keys via `X-Jev-Jev-Key` and `X-Jev-Openai-Key` on `/connections/test` and live `/turn` or `/eval-case` requests only. Verification uses the body above. Any personal key selects request-scoped clients with no operator-credential fallback. `/connections` reports operator configuration; the UI merges this with tab-memory personal status. Disconnect is a browser operation: abort active work, delete keys, and return to simulation. No key session or database exists.

`mode` is `mock` or `live`. Messages are `{role: "user" | "assistant", content: string}`, alternate starting with user, and end with user. Supply at most 40 messages. A terminal state cannot accept another user message. A result includes `from`, `to`, `reply`, `confidence`, `probabilities`, `reason`, `model`, `agentModel`, token counts, elapsed time, and the exact input/questions.

Runnable local request, without jq or credentials:

```sh
node --input-type=module - <<'JS'
import { readFileSync } from 'node:fs';
const project = JSON.parse(readFileSync('examples/workflows/example-support.json', 'utf8'));
const response = await fetch('http://localhost:5173/api/studio/turn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project, currentState: project.initial, mode: 'mock',
    messages: [{ role: 'user', content: 'I was charged twice' }],
  }),
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
console.log(await response.json());
JS
```

Validation errors return 400, missing authentication 401, rejected origins or disabled hosted live mode 403, excessive body size 413, per-instance connection/live rate limits 429, and provider/turn failures 502. Error responses use `{error: string}` and omit raw provider errors. Requests are capped at 192 KB and 50 seconds. Disconnecting cancels the server signal; cancellation cannot guarantee that a provider has not already consumed tokens.

This API accepts client-supplied workflow and conversation state. Use it as a development interface. A production business application needs its own trusted state storage and authorization; never treat these client values as proof of an external action.

## Code-first runtime

`defineDecision` keeps questions, named outcomes, and a typed policy together. `defineMachine` creates an XState actor that starts at `idle`, invokes the provider on `RUN`, and ends in a declared outcome, `failed`, or `cancelled`. `CANCEL` aborts the invocation; late completions cannot change the final state.

The [support example](../examples/support-routing/machine.ts) combines a department Choice, urgency Noul, and frustration Score in one request. Its policy uses department confidence and a no-match option to choose billing, technical, or human review.

Run its deterministic version:

```sh
npm run example
```

Inside this repository, the corresponding live server-side wiring is:

```ts
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createJevProvider } from "@jev-state/typesafe";
import { toPromise } from "xstate";
import { supportMachine } from "./examples/support-routing/machine.js";

const provider = createJevProvider(new TypeSafeClient()); // TYPESAFE_API_KEY
const actor = supportMachine.createActor(
  provider,
  { ticket: { message: "I was charged twice" } },
  0.8,
);
actor.subscribe((snapshot) => console.log(snapshot.value));
const done = toPromise(actor);
actor.start();
actor.send({ type: "RUN" });
await done;
console.log(actor.getSnapshot().context.policy);
actor.stop();
```

Run TypeScript examples with `node --env-file-if-exists=.env.local --import tsx <file.ts>`. Do not import the provider adapter into browser code. These workspace packages are not yet published to npm and their APIs may change.

## Evaluation semantics

- Cases start with fresh history and the project's initial state.
- Each user message uses the same turn engine as the UI. Assistant replies are appended before the next turn.
- Passing requires the expected final state and the optional case-insensitive final-reply substring.
- Invalid/no-match decisions, low confidence, terminal-state timing, and provider failures are distinct behaviors to test.
- Coverage counts visited states and actually taken declared transitions. Staying in place is not an edge.
- Report signatures identify the behavior and dataset. They are change-detection strings, not cryptographic attestations or model-version pinning.
- Token counts reflect returned usage, not a provider invoice. Failed or cancelled operations may consume tokens that cannot be reported reliably.
- Reports can contain private transcripts. The CLI writes reports with restrictive file permissions; keep sensitive artifacts out of public CI uploads.

## Extending the project

Start with a small JSON fixture and a regression case. Change the shared schema before adding new editor controls. Preserve import validation and history snapshots. If a change affects behavior, update `workflowSignature`; if it only affects evaluation, update `evaluationSignature`. Review existing backups when changing their schema.

Provider integrations must retain the same typed judgment boundary and credential isolation: operator keys stay server-side, while personal keys stay in tab memory and request-scoped server clients. Never add credentials to persisted workspace types or provider error responses. Check the current [TypeSafe SDK](https://docs.typesafe.ai/sdk/javascript), [Choice contract](https://docs.typesafe.ai/primitives/choice), and [confidence guidance](https://docs.typesafe.ai/confidence) before changing integration behavior.

## Code generation

`packages/core/src/handoff.ts` builds a standalone TypeScript project from a schema-validated workflow, report metadata, and runtime source files. The browser imports the runtime and schemas as raw source through Vite, then uses fflate to create a local ZIP. The executable runtime is shared with the server; no separate generated decision algorithm can drift from it. Runtime credentials are never inputs to generation. Reports contribute only validation summaries; conversation histories are excluded. The workflow includes saved regression cases and their messages.

`evaluationEvidence` evaluates the most recent report for each mode independently, requires all current cases, checks the full behavioral/case signature, and flags failed, incomplete, stale, unrun, or absent suites. It does not label simulation as model validation or promise production correctness. Downloading unvalidated code remains allowed with its status visible.

`tests/handoff.test.ts` unzips into a temporary directory outside the repo, typechecks the generated files, executes the example and regression CLI, checks pass/fail/error exit codes, and compares generated turn behavior against the studio. Installed public dependencies are symlinked to keep CI offline for that test. A separate fresh-install smoke check verifies `npm install` in the downloaded project. Browser tests cover the complete conversation → expectation → failure → criteria → code path, clipboard copying, ZIP contents, and mobile layout.
