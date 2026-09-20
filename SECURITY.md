# Security

Report vulnerabilities privately through [GitHub's security advisory form](https://github.com/priyankark/jev-state/security/advisories/new). Include reproduction steps and affected versions. Do not include real credentials or private transcripts in public issues.

## Deployment boundary

The default server binds to `127.0.0.1`. Operator keys are read from server environment variables and never returned by the connection API. The public Vercel studio has no operator provider keys. Visitors can optionally connect their own keys with `STUDIO_BYOK=1`; simulation remains the default. `STUDIO_PUBLIC_DEMO=1` disables connector construction and live API calls even if credentials are accidentally present.

On Vercel, or when `STUDIO_ORIGIN` is configured for a custom deployment, using operator environment keys also requires `STUDIO_ACCESS_TOKEN`. This is a shared access gate, not a multi-user identity system. Set a long random value. Cookies are HTTP-only, SameSite Strict, and Secure on Vercel/HTTPS origins. Changing the token invalidates existing cookies. Every authorized person uses the installation's provider account; do not share access with untrusted users. Add reverse-proxy authentication/rate limiting for a broader deployment.

The API validates host/origin, limits request size and duration, validates projects and model responses, and sanitizes provider failures. These controls are not a substitute for authenticating a production application's users or authorizing real external actions.

## Data boundary

The browser stores projects, transcripts, and evaluation reports in localStorage. They are not encrypted. Exported files contain this data too. Anyone with access to the browser profile or backup can read it.

Simulation sends inputs to this installation's server without a provider call. Live Jev sends the history and workflow to TypeSafe. Optional generated replies send the history and agent/state instructions to OpenAI. Hosting and provider policies govern their processing. The application does not persist Studio request bodies in a server database; infrastructure may maintain its own operational logs.

Studio API state is supplied by the client. It is a development workbench, not a trusted ledger or business authorization system. Never use a client-supplied final state as proof that a payment, approval, or external action occurred.

## Credential handling

Personal keys are held in tab memory only. They are sent to the same-origin API for verification and live requests, and the API uses them only in request-scoped SDK clients. They are not stored in localStorage, sessionStorage, cookies, project data, exports, or a database. Reload, tab close, and **Disconnect and forget keys** clear browser keys. Verification checks provider model-list access; it does not save the key or authorize later requests. Requests containing any personal key never borrow another provider's operator key. Personal live requests require `X-Jev-Request: 1` and same-origin checks; no cross-origin API access is enabled.

The operator still receives personal keys during requests: this is a trusted relay, not an end-to-end encrypted vault. Compromised page scripts or browser extensions can read tab memory. Self-host if you do not trust an installation. SDK logging is disabled, and errors are sanitized. Operators must avoid capturing keys in proxy, APM, or request-body/header logs. There is no external key store or Upstash dependency. Per-instance request limits reduce accidental bursts; they do not enforce a distributed billing cap. Disconnect cannot undo usage already accepted by a provider.

Keep `.env.local`, `.local/`, and `.vercel/` out of commits. Never use `VITE_` or `NEXT_PUBLIC_` for secrets. If a key leaks, revoke it at the provider and replace the server variable; removing it from a file or deployment does not revoke it. Remove obsolete deployments containing old credentials. Use dedicated keys with provider usage limits where available.

The supported code is the current main branch. There is no formal response-time or support guarantee.
