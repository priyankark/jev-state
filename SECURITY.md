# Security

Report vulnerabilities privately through [GitHub's security advisory form](https://github.com/priyankark/jev-state/security/advisories/new). Include reproduction steps and affected versions. Do not include real credentials or private transcripts in public issues.

## Deployment boundary

The default server binds to `127.0.0.1`. Provider keys are read from server environment variables and never returned by the connection API. The public Vercel demo has no provider keys and only permits simulation. `STUDIO_PUBLIC_DEMO=1` disables connector construction and live API calls even if credentials are accidentally present.

On Vercel, or when `STUDIO_ORIGIN` is configured for a custom deployment, live access also requires `STUDIO_ACCESS_TOKEN`. This is a shared access gate, not a multi-user identity system. Set a long random value. Cookies are HTTP-only, SameSite Strict, and Secure on Vercel/HTTPS origins. Changing the token invalidates existing cookies. Every authorized person uses the installation's provider account; do not share access with untrusted users. Add reverse-proxy authentication/rate limiting for a broader deployment.

The API validates host/origin, limits request size and duration, validates projects and model responses, and sanitizes provider failures. These controls are not a substitute for authenticating a production application's users or authorizing real external actions.

## Data boundary

The browser stores projects, transcripts, and evaluation reports in localStorage. They are not encrypted. Exported files contain this data too. Anyone with access to the browser profile or backup can read it.

Simulation sends inputs to this installation's server without a provider call. Live Jev sends the history and workflow to TypeSafe. Optional generated replies send the history and agent/state instructions to OpenAI. Hosting and provider policies govern their processing. The application does not persist Studio request bodies in a server database; infrastructure may maintain its own operational logs.

Studio API state is supplied by the client. It is a development workbench, not a trusted ledger or business authorization system. Never use a client-supplied final state as proof that a payment, approval, or external action occurred.

## Credential handling

Keep `.env.local`, `.local/`, and `.vercel/` out of commits. Never use `VITE_` or `NEXT_PUBLIC_` for secrets. If a key leaks, revoke it at the provider and replace the server variable; removing it from a file or deployment does not revoke it. Remove obsolete deployments containing old credentials. Use dedicated keys with provider usage limits where available.

The supported code is the current main branch. There is no formal response-time or support guarantee.
