# Self-hosting

Jev State has no account system, database, or payment service. Each browser has its own workspace. Deploying the app does not sync projects between people or devices.

## Local development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173`. The server binds to loopback by default. Simulation works immediately. Add provider keys only when needed, then restart the server. Frontend changes hot-reload; server changes need a restart.

## Configuration

| Variable                 | Default                    | Purpose                                                                                                |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `PORT`                   | `5173`                     | Node server listening port                                                                             |
| `HOST`                   | `127.0.0.1`                | Bind address; use `0.0.0.0` inside a container                                                         |
| `TYPESAFE_API_KEY`       | unset                      | Server-only live Jev credential                                                                        |
| `TYPESAFE_DEFAULT_MODEL` | SDK default / `jev-latest` | Model alias used by the TypeSafe SDK                                                                   |
| `TYPESAFE_BASE_URL`      | `https://api.typesafe.ai`  | Setup checks require the official endpoint; Studio also uses this fixed official endpoint              |
| `OPENAI_API_KEY`         | unset                      | Optional server-only OpenAI credential                                                                 |
| `OPENAI_MODEL`           | `gpt-4.1-mini`             | Connection metadata default; each project's agent settings select its actual request model             |
| `STUDIO_ACCESS_TOKEN`    | unset                      | Shared workspace access code; required for hosted operator-supplied keys                               |
| `STUDIO_BYOK`            | unset / `0`                | Set to `1` to accept personal provider keys per request; no credential store                           |
| `STUDIO_PUBLIC_DEMO`     | unset / `0`                | Set to `1` to disable live connectors and provider tests regardless of keys                            |
| `STUDIO_ORIGIN`          | unset                      | Exact public origin for a custom Node deployment, e.g. `https://studio.example.com`; no trailing slash |

The server reads `.env.local` when present. Existing shell environment variables take precedence. Keep secrets out of `VITE_*` variables and never bake them into images. The former `STUDIO_MODE` setting is obsolete.

## Vercel

1. Fork the repository and import it into Vercel.
2. Use the included Vite configuration: `npm run build`, output `dist`, Node.js 22.
3. For a simulation-only demo, set `STUDIO_PUBLIC_DEMO=1` and leave provider keys unset. For a public studio with personal connections, set `STUDIO_PUBLIC_DEMO=0` and `STUDIO_BYOK=1`, leaving provider keys unset.
4. Deploy. Vercel assigns a `*.vercel.app` domain; no custom domain is necessary.

For your own protected live installation, set `STUDIO_PUBLIC_DEMO=0`, add `TYPESAFE_API_KEY`, optionally add `OPENAI_API_KEY`, and set a long random `STUDIO_ACCESS_TOKEN`. Redeploy, unlock the workspace, and test the connections. For example, generate an access code locally with `openssl rand -hex 32`; save it privately.

Without an access token, hosted endpoints cannot use operator environment keys, even if a key was accidentally added. With `STUDIO_BYOK=1`, visitors can instead supply their own keys for verification and live requests. The access code is shared by the installation's users; it is not an account system, role model, or tenant boundary. Their browser data remains separate, but their model requests use your server credentials.

### Personal connections and costs

With `STUDIO_BYOK=1`, visitors connect a Jev or optional OpenAI key in **Connections**. The browser keeps verified keys only in tab memory and sends them to the same-origin API for connection checks and live requests. Reload, tab close, or **Disconnect and forget keys** clears them. The server creates request-scoped SDK clients and does not retain credentials, issue a key cookie, or store them in a database. Disconnect aborts active browser work; already accepted provider requests may still incur usage.

Supplying any personal key selects only that visitor's keys: a missing provider never falls back to an operator key. Simulation stays the default and sends no personal keys. The provider bills the key owner for live usage. Connecting verifies model-list access without generating a reply. Visitors must trust the operator handling these requests; self-hosting is available for full control.

No Upstash, database, payment service, or new infrastructure subscription is required. Your hosting provider's ordinary usage limits and billing still apply. The API applies best-effort **per-instance** limits of 15 verifications and 60 live requests per minute per IP; these are not a global quota or billing cap. Vercel's overwritten `x-vercel-forwarded-for` is trusted on Vercel; elsewhere the socket IP is used. A reverse proxy may therefore share a limit across visitors. Configure proxy/observability services to redact request bodies and `X-Jev-Jev-Key` / `X-Jev-Openai-Key` headers. Provider SDK logging is disabled in Studio.

Environment changes only affect new deployments. Remove obsolete deployments or revoke old provider keys when retiring a live deployment. Preview deployments need their own variables and protection decisions. Do not give secrets to untrusted forks.

The Studio API is stateless between requests and has a 50-second execution deadline. The original `/legacy` inspector relies on process-local SSE history and is only supported on the local Node server.

## Production Node server

```sh
npm ci
npm run build
npm start
```

For a reverse proxy, set `HOST=0.0.0.0`, `STUDIO_ORIGIN=https://studio.example.com`, and `STUDIO_ACCESS_TOKEN`. Preserve the original `Host` header and terminate TLS at the proxy. Only expose the proxy publicly. Requests from another origin are rejected. A shared code is appropriate for a trusted small group; use an authenticated proxy and rate controls for a broader audience.

## Docker

```sh
docker build -t jev-state .
docker run --rm -p 127.0.0.1:5173:5173 \
  -e STUDIO_PUBLIC_DEMO=1 \
  jev-state
```

For local live use, omit demo mode and pass keys at runtime:

```sh
docker run --rm -p 127.0.0.1:5173:5173 \
  -e TYPESAFE_API_KEY \
  -e OPENAI_API_KEY \
  jev-state
```

The Dockerfile excludes local environment files and runs the app as the unprivileged `node` user. It contains no database or persistent volume: work is in the browser. Behind a public proxy, apply the origin and access-token configuration above.

## Backups and troubleshooting

- **Moving a workspace:** save workflow edits, choose **Back up workspace**, open the destination deployment, and choose **Restore workspace**. Restoration replaces that browser's workspace after confirmation.
- **Port already in use:** run `PORT=5175 npm run dev` and visit that port. Playwright uses 5174.
- **Personal connection disappears after reload:** expected; reconnect your key. Keys are deliberately not persisted.
- **Connection shows unconfigured:** connect a personal key when BYOK is enabled, or check the server environment, restart/redeploy, and refresh Connections. Keys added only to your shell are not automatically added to Vercel.
- **Hosted live button disabled:** confirm demo mode is off, then connect your own key with BYOK enabled or configure a server key plus access token.
- **403 origin/host error:** use localhost for the default setup, or configure the exact public `STUDIO_ORIGIN` and preserve its Host header at your proxy.
- **Provider error:** check account access, the configured model, and provider usage limits. Error messages intentionally omit raw SDK responses and keys.
- **Storage full:** download a backup, remove unneeded projects/history, or use another browser profile. Do not clear site data before exporting what you need.
- **Another tab changed the workspace:** saving is paused. Back up the current tab if necessary, then reload to read the other tab's changes.
- **Failed evaluations after editing:** inspect the case and state criteria, then rerun. Old reports are marked stale when behavior or cases change.

See [SECURITY.md](../SECURITY.md) for the data and authentication boundaries.
