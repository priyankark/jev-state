# Jev State

Jev State is an open-source studio for building stateful AI conversations. Draw a workflow, let Jev choose the next state, optionally let an OpenAI model write replies, and run repeatable multi-turn evaluations.

The project is MIT licensed and runs locally without an account, subscription, hosted database, or payment provider.

## Run it locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:5173>. Simulation works without API keys. Add keys to `.env.local` when you want model-backed runs:

```sh
TYPESAFE_API_KEY=...
OPENAI_API_KEY=...
```

Keys stay server-side. They are never placed in project exports, browser storage, or conversation reports.

## What you can do

- Build flat state machines with up to 12 states.
- Drag states, connect handles, edit transitions, auto-layout the graph, and undo or redo changes.
- Run multi-turn conversations in deterministic Simulation mode or with live Jev decisions.
- Use an optional OpenAI Responses agent for generated replies.
- Add evaluation cases with up to five user turns, expected final states, and reply assertions.
- Inspect transition probabilities, model inputs, latency, and token usage.
- Export and import projects, conversations, and evaluation reports as JSON.

The home screen's workflows are explicitly labeled examples. Copying one creates an editable project; examples are never treated as a user's existing work.

## Testing

```sh
npm run build
npm test
npm run test:e2e
```

The browser suite covers graph editing, transition connections, persistence, conversations, evaluations, mobile layout, and keyboard-accessible dialogs. Live Jev checks require a server key and are kept outside the default test run.

## Project map

- `apps/studio/src/Product.tsx`: editor, conversations, evaluations, and connections.
- `apps/studio/src/ProjectGraph.tsx`: interactive graph canvas and transition inspection.
- `packages/core`: workflow schemas, templates, evaluation types, and the XState-backed runtime.
- `packages/typesafe`: the server-only Jev adapter.
- `server/conversation.ts`: shared simulation, Jev, and OpenAI conversation engine.
- `docs/UX_REVIEW.md`: interaction review and regression coverage.

The original single-decision studio remains available at `/legacy` for local development. Nested and parallel statecharts, background evaluation jobs, and remote tool connectors are future work.

## TypeSafe

Jev is TypeSafe's System One model. Read the current [TypeSafe JavaScript SDK documentation](https://docs.typesafe.ai/sdk/javascript) before changing the adapter. Keep TypeSafe credentials server-side.

## License

MIT. See [LICENSE](LICENSE).
