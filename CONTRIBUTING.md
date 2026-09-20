# Contributing

Jev State is MIT licensed. Contributions should make building, understanding, or testing Jev state machines easier. No subscription, account service, payment SDK, or hosted database is needed.

## Local setup

Use Node.js 22, run `npm ci`, copy `.env.example` to `.env.local`, and run `npm run dev`. Simulation needs no keys. Browser tests need Chrome: `npx playwright install chrome`.

Read [AGENTS.md](AGENTS.md) and the project's [TypeSafe skill](.agents/skills/typesafe-ai/SKILL.md) when using a coding agent. Consult the current [TypeSafe docs](https://docs.typesafe.ai/sdk/javascript) before changing provider contracts.

## Before submitting

```sh
npm run build
npm test
npm run test:e2e
```

For runtime changes, add a regression case that demonstrates the changed behavior, including failure or cancellation when relevant. For graph changes, actually drag, connect, select, save, and reload the canvas; inspect a narrow viewport too. Do not replace interaction tests with checks that merely prove a button exists.

Keep simulation deterministic and free of provider requests. Live tests must be explicit opt-ins and may consume provider usage. Never commit `.env.local`, `.local/`, API keys, private transcripts, or account data.

Use `npx prettier --write <changed-files>` for TypeScript/TSX formatting. Keep PRs focused: explain the user-visible problem, resulting behavior, verification, and any remaining limitation. Update documentation and JSON examples when schemas or commands change.

## Design principles

- Code owns allowed transitions and uncertainty policy; model output never bypasses validation.
- Treat templates as examples. Make simulation and live decisions visibly distinct.
- Keep credentials server-side and fail closed for unprotected public model access.
- Preserve user work across errors. A failed request must not advance a conversation.
- Keep graph navigation, dialogs, and core editing usable with a keyboard and at mobile widths.
- Prefer portable files and inspectable behavior over hidden service dependencies.

Open a [bug report](https://github.com/priyankark/jev-state/issues/new?template=bug_report.yml) with reproduction steps, expected behavior, browser/Node versions, and a sanitized project when possible. For larger changes, describe the intended workflow and tradeoffs in an issue first. Report vulnerabilities privately through [GitHub Security](https://github.com/priyankark/jev-state/security/advisories/new).
