# Setup

See [README.md](README.md) for the studio and [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)
for local development, Docker, Vercel, accounts, storage and subscriptions.

No credentials are part of this repository. Copy `.env.example` to `.env.local`.
Simulation needs no provider account. For live decisions, create a TypeSafe key
and keep it on the server. Hosted cloud users add their personal keys through
Connections; those keys are verified and encrypted per account.

`npm run check:env` verifies TypeSafe authentication and available models.
`npm run smoke:jev` makes one real inference with a synthetic ticket.

The TypeSafe SDK returns `ModelCard[]` from `models.list()` and accepts
`maxRetries` for retry configuration. Consult the current documentation and
installed type declarations when updating dependencies.
