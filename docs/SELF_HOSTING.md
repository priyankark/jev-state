# Self-host Jev State

## Local studio, no cloud subscription

Use Node 22, `npm ci`, copy `.env.example` to `.env.local`, then `npm run dev`.
Keep `STUDIO_MODE=local`. Optional provider keys live only on the server.
Projects and history stay in the browser; export them for backups.

Docker: `docker build -t jev-state .`, then
`docker run --rm -p 127.0.0.1:5173:5173 --env-file .env.local jev-state`.
The container binds port 5173; the host binding above keeps it local.
Docker files are provided, but a Docker build was not validated on the development Mac.

To publish a private single workspace on Vercel, keep local mode and set a long,
random `STUDIO_ACCESS_TOKEN`. This is a single-owner access gate. For separate
customer accounts, use cloud mode below.

## Cloud accounts and data

1. Create a dedicated Supabase project. Apply each SQL file in
   `supabase/migrations` in filename order through the SQL editor or CLI.
2. Set `STUDIO_MODE=cloud`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` on the server. The publishable key is public by
   design. The service-role/secret key must never reach the browser.
3. Generate a 32-byte encryption key using
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   and set `CREDENTIAL_ENCRYPTION_KEY`. Back it up separately from the database.
4. In Supabase Auth, set Site URL to your deployment's origin. Add exact local
   and deployed origins to allowed redirect URLs. Set the password minimum to
   at least 12 characters if email auth is enabled.
5. Create a GitHub OAuth app whose callback is
   `https://YOUR_PROJECT.supabase.co/auth/v1/callback`. Add its client ID and
   secret to Supabase's GitHub provider; enable it. Set `GITHUB_AUTH_ENABLED=true`.
   The application asks only for profile and email access.
6. Optional email signup: configure a production SMTP sender and verified domain
   in Supabase. Keep email confirmation enabled. Set `EMAIL_AUTH_ENABLED=true`
   only when confirmation and password-reset delivery work. Supabase's built-in
   sender is not a production email service. Without SMTP, new users use GitHub;
   existing password accounts may still sign in.

No application data tables grant access to anon or authenticated database roles.
All requests pass through the server, which verifies the bearer session and
provides the authenticated user ID. Credentials are encrypted and bound to that
user and provider. Browser tokens are managed by Supabase's client SDK.

Back up Postgres and encryption material. Free Supabase projects do not include
managed production backups; choose your operational plan before a paid launch.
Rate limits are persisted in Postgres and work across Vercel instances. Sessions
and signup rate limits are managed by Supabase Auth.

## Dodo billing

1. Create a separate brand and monthly recurring SaaS product in **test mode**.
2. Set `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_ENVIRONMENT=test_mode`,
   `DODO_PAYMENTS_PRODUCT_ID`, and `APP_URL` (the canonical origin).
3. Add `https://YOUR_ORIGIN/api/studio/billing/webhook` as a webhook endpoint.
   Subscribe to subscription active, updated, renewed, on_hold, failed, cancelled,
   and expired events. Save its signing secret as `DODO_PAYMENTS_WEBHOOK_KEY`.
4. Deploy. Test checkout with Dodo's documented test cards and verify that a real
   signed webhook updates the account from Free to Pro. Verify cancellation and
   the customer portal. A redirect or client-supplied plan must never grant Pro.
5. For live launch, finish Dodo merchant/brand review, choose the actual product
   price, and provide the required business/support and customer policies.
   Create the live product and webhook, then replace the test credentials,
   product ID, and webhook secret and set `DODO_PAYMENTS_ENVIRONMENT=live_mode`.
   Use a separate production database or clear test customer mappings before
   switching modes: test customer/subscription IDs do not exist in live mode.

Checkout links belong to one customer. Concurrent creation is locked; pending
links are reused and payments in progress prevent another checkout. Webhooks
verify raw-body signatures, retrieve the current provider subscription, filter
by product, and apply updates atomically with duplicate/stale-event protection.
Failed deliveries return a retriable status. Monitor Dodo delivery logs and
replay failed events after fixing an outage. Pro expires at the stored paid-period
boundary if renewals stop arriving. Scheduled cancellation retains access while
the subscription remains active and the paid period has not expired.

Cloud plans use three free or 100 paid projects. The limit is in the SQL save
function and the server entitlement helper; change both when changing plans.
Existing projects stay readable and editable after a downgrade. Delete or export
them if you no longer need them. Account deletion is blocked while a subscription
is active or on hold so billing cannot become detached from the account.

## Vercel

Run `vercel link`, configure the server environment variables, then `vercel --prod`.
`vercel.json` serves the Vite build and sends `/api/studio/*` to a Node function.
Use a separate Supabase project, OAuth app and Dodo test product for previews.
Never prefix private keys with `VITE_` or `NEXT_PUBLIC_`.

Run `npm run build`, `npm test`, browser tests, and cloud integration tests before
promotion. Check sign-in, cross-device persistence, free-project limits, provider
connections, billing portal, and webhook deliveries on the deployed domain.
