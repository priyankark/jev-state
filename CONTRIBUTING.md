# Contributing

Jev State is MIT licensed. The hosted subscription pays for managed cloud storage;
the studio and runtime remain open source.

Use Node 22 and `npm ci`. Copy `.env.example` to `.env.local` and set
`STUDIO_MODE=local` to develop without cloud accounts or billing. Simulation needs
no API key. Run `npm run dev`, then open http://localhost:5173.

Before a pull request, run `npm run build`, `npm test`, and `npm run test:e2e`.
For database changes, use a dedicated test Supabase project and run
`RUN_CLOUD_TESTS=1 node --env-file=.env.local --import tsx --test tests/cloud.test.ts`.
That test creates and deletes isolated test accounts. Never point tests at another
application's database.

Put SQL changes in a new migration. Keep credentials server-side. Preserve
explicit example labels and the distinction between simulation and live runs.
Explain what changes for a user and include the validation you ran in your PR.
