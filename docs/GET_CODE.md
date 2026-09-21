# From tested behavior to application code

The intended outcome of Jev State is a decision flow you understand, regression cases that exercise it, and code you can run in your own application.

## Before the handoff

1. **Define** the agent's routing instructions, states, entry criteria, replies, and allowed transitions.
2. **Try** a conversation. Inspect a reply's state badge to see the input, Choice criteria, probabilities, and threshold decision.
3. Choose **Save as regression test**. Confirm the state you expected, including when the conversation went wrong. Cases replay up to five user messages; assistant replies are generated again.
4. **Test** the cases. Inspect failures and use **Review state criteria** to fix behavior. Rerun to catch regressions. Simulation tests keyword-based wiring; Live Jev tests model decisions and incurs usage.
5. Choose **Get code**. The ZIP uses the saved workflow; navigating there first saves valid editor changes.

## What you receive

| File                                                 | Purpose                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `workflow.json`                                      | States, criteria, transitions, threshold, agent configuration, and your regression cases             |
| `workflow.ts`                                        | `startConversation` and `sendMessage` integration functions                                          |
| `example.ts`                                         | Copyable server-side usage example                                                                   |
| `.github/workflows/check.yml`                        | GitHub Actions typecheck and simulation regressions on pushes and pull requests; no provider secrets |
| `evaluate.ts`                                        | Regression runner for local development and CI                                                       |
| `lib/`                                               | The actual studio execution engine, explicit provider-client construction, and validation schemas    |
| `validation.json`                                    | Simulation and live status at export, with report timestamps                                         |
| `package.json`, `tsconfig.json`                      | Public dependencies and TypeScript configuration                                                     |
| `.env.example`, `.gitignore`, `README.md`, `LICENSE` | Setup instructions, credential placeholders, ignored files, and license                              |

No repository clone, unpublished package, hosted studio, account, or database is required by this code. The **Copy file** button copies the previewed file. The example depends on the included `workflow.ts`, `workflow.json`, and `lib/`; it is not a standalone one-file runtime.

## Run the downloaded project

Unzip into a directory and open a terminal there. Use Node.js 22 or newer:

```sh
npm install
npm run typecheck
npm test
npm start
```

These commands default to simulation and make no model-provider requests. The example uses the first saved test message, or `Hello` when no cases exist. `npm test` exits 0 when all expectations pass, 1 for failed expectations, and 2 for execution/configuration errors or an empty suite. It prints a JSON report suitable for CI. Commit the generated lockfile for repeatable installs. The included GitHub Actions workflow runs these typechecks and simulation tests automatically; live inference requires a deliberate separate setup.

Optional per-turn expectations travel with the code in `workflow.json`: for example, `expectedPath: ["billing", "resolved"]` checks both turns, while `null` skips a turn. A wrong intermediate state fails even when the final state and reply match. A conversation ending before all test messages are consumed also fails (exit 1) and keeps its partial trace in the JSON report. These assertions run through the same shared engine as the studio.

For live use, copy `.env.example` to `.env`, set `TYPESAFE_API_KEY`, and add `OPENAI_API_KEY` only if the workflow enables generated replies. Explicitly run `npm run test:live` for model evaluations. Change `startConversation({ mode: "mock" })` to `{ mode: "live" }` in the example for live turns. These requests are billed to your provider account.

## Integrate into an existing server

Copy `workflow.ts`, `workflow.json`, and `lib/` into your server project and install the dependencies in the generated `package.json`. Use the example's import path relative to that folder:

```ts
import { startConversation, sendMessage } from "./workflow.js";

let session = startConversation({ mode: "live" });
const first = await sendMessage(session, "I was charged twice");
session = first.session;

const second = await sendMessage(session, "It is fixed now");
session = second.session;
```

`sendMessage` returns `{session, decision}` without mutating the input session. A decision includes `from`, `to`, `reply`, `confidence`, `probabilities`, resolved models, token counts, the input and questions, and the deterministic threshold explanation. These fields are evidence of what ran; the explanation is not model reasoning or a guarantee that the choice was correct.

Store the returned session per user on your server. Serialize requests per conversation to avoid racing updates; authenticate and authorize access to that state. Do not accept an untrusted client's claimed workflow state as proof of an external action. This starter does not add a database, HTTP server, account system, or business tools. Add those at your application's boundary. Keep keys on the server.

The same limits apply as in the studio: flat workflows with 2–12 states, 40 alternating messages per turn request, up to five user turns per regression case, and a 50-second execution deadline. Terminal states reject further turns. SDK clients use the official TypeSafe and OpenAI endpoints, bounded retries, and disabled logging. Optional generated replies use the OpenAI Responses API with `store: false`; no external tools run.

## Read the evidence honestly

The code page tracks simulation and live reports independently. It uses the most recent report for each mode and checks whether the report covers the current workflow and every current case. A changed criterion, threshold, model setting, or test makes old evidence stale. Stopped runs remain incomplete. A previous passing run cannot hide a newer failure.

You can download code before validation. The interface and `validation.json` retain that status. Passing live cases establish behavior on that dataset, not general correctness. Add ambiguous, multi-turn, and failure-path examples that represent your own users.

## Data and round trips

Credentials, browser sessions, and saved conversation histories are excluded. Your workflow instructions, authored replies, and saved regression messages are included; review these before sharing the ZIP. Regression reports may also contain private transcripts.

Import `workflow.json` back into the studio to make a new editable copy. Change criteria or add cases, rerun tests, and download again. Changes made only to `lib/` in your application are custom code; the studio does not import arbitrary TypeScript modifications or reproduce them automatically.
