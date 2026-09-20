# Jev State

An open-source studio for stateful AI: visual workflows, multi-turn conversations, and repeatable evaluations. Jev judges the next state, XState enforces transitions, and an optional OpenAI Responses agent writes the reply.

**[Hosted studio](https://jev-state.vercel.app)** · [Self-hosting](docs/SELF_HOSTING.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

## Start locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:5173. Simulation works without accounts or API keys. Add a server-side `TYPESAFE_API_KEY` for live decisions and `OPENAI_API_KEY` for generated replies.

1. Create a blank project or copy an explicitly labeled example.
2. Drag states to arrange the graph, connect their handles to add transitions, and click a state or line to edit it. Undo/redo and automatic layout are available. State settings and workflow settings live beside the canvas.
3. Converse across multiple turns and inspect each transition's probabilities, inputs, models, latency, and token usage.
4. Add evaluation cases with up to five user turns, an expected final state, and an optional reply assertion. Run, inspect, and export results.

Examples are templates, never presented as your own existing projects. Simulation uses synthetic keyword fixtures; live mode measures actual model behavior. OpenAI receives full conversation history and the active state's instructions. Tool execution and remote MCP/Agents SDK endpoints are not included yet.

## Hosted SaaS

- Supabase accounts with GitHub sign-in; optional email signup and password recovery when SMTP is configured.
- A private cloud workspace per account, with optimistic concurrency and visible save failures.
- **Free: 3 projects. Pro: 100 projects.** Limits are enforced atomically in Postgres.
- Personal Jev/OpenAI keys, verified and encrypted with AES-256-GCM. Hosted customers never use the owner's environment keys.
- Dodo hosted subscriptions, customer portal, cancellation, and signed webhook synchronization.
- Workspace export and account deletion. Downgrading preserves existing projects; adding projects beyond the free limit requires upgrading or removing projects.

The hosted Pro plan is **$19/month USD**, plus any applicable tax, billed through Dodo Payments. Live checkout uses a separate verified Jev State brand. The subscription lifecycle was validated with Dodo test payments before activation. See [service terms](https://jev-state.vercel.app/terms) and [privacy](https://jev-state.vercel.app/privacy).

Cloud mode retains the latest 60 conversations and 40 evaluation reports per account, with a 4 MB request limit. Export for longer retention. Local mode stores work in this browser. Unsynced cloud changes have a device backup keyed to the account. After reopening, a recovery banner offers a download; export the backup before discarding it.

The editor supports 12 flat states, 20 conversation turns, and 30 evaluation cases per project. Cases run sequentially in the browser; they are not durable background jobs. Node positions persist in exports and cloud saves. Moving nodes does not reset a conversation or invalidate evaluations. Workflow snapshots preserve past conversations, and evaluation configuration signatures identify outdated results, including changes to the initial state. Provider charges may occur even if a request is cancelled.

## Deploy or self-host

See [SELF_HOSTING.md](docs/SELF_HOSTING.md) for Vercel, Docker, Supabase migrations, authentication, encrypted connections, and Dodo setup. Self-hosted local mode has no paid project limit. All application source remains MIT licensed; hosted plans pay for managed service.

```sh
npm run build
npm test
npm run test:e2e
```

Cloud integration checks, against a dedicated project with both SQL migrations applied:

```sh
RUN_CLOUD_TESTS=1 node --env-file=.env.local --import tsx --test tests/cloud.test.ts
```

These create and remove isolated test users. Tests cover tenant isolation, direct database access denial, concurrent saves, free limits, subscription expiry and ordering, credential encryption, multi-turn state transitions, eval pass/fail results, and browser workflows. OpenAI's request contract is tested with a fake transport; live OpenAI use requires your own key.

## Source

- `apps/studio/src/Product.tsx`: editor settings, conversations, evaluations, connections.
- `apps/studio/src/ProjectGraph.tsx`: interactive canvas, layout, connections, state and transition inspection.
- `apps/studio/src/Cloud.tsx`: accounts, cloud synchronization, plans and account controls.
- `server/cloud-api.ts`: authenticated SaaS API and tenant-scoped operations.
- `server/billing.ts`: raw-body Dodo webhook verification and subscription reconciliation.
- `supabase/migrations`: tables, permissions, quotas, revision checks, checkout locks.
- `server/conversation.ts`: shared simulation/live conversation and evaluation engine.
- `packages/core`: typed decision runtime, workflow schemas, and templates.
- `packages/typesafe`: server-only Jev adapter.

The original single-decision studio remains at `/legacy` for local development. Its in-memory SSE API is not deployed on Vercel.

Team collaboration, nested/parallel statecharts, model-graded evals, background jobs, and remote tool connectors remain roadmap work. This release provides individual accounts and personal workspaces.

References: [TypeSafe SDK](https://docs.typesafe.ai/sdk/javascript), [OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state), [Supabase Auth](https://supabase.com/docs/guides/auth), [Dodo subscriptions](https://docs.dodopayments.com/developer-resources/subscription-integration-guide).
