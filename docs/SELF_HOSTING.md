# Self-hosting Jev State

Jev State is open source and local-first. The normal deployment has no user accounts, database, subscription, quota, or payment service.

## Local development

1. Install Node.js 22 or newer.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run dev`.
5. Open `http://localhost:5173`.

Simulation is available immediately. Put `TYPESAFE_API_KEY` in the server environment for live Jev decisions and `OPENAI_API_KEY` for generated replies. Do not expose either value through a client-side environment variable.

## Vercel

The app can be deployed as a normal Vercel project:

1. Import the repository.
2. Set `STUDIO_MODE=local`.
3. Add `TYPESAFE_API_KEY` and/or `OPENAI_API_KEY` as server-side production variables if you want live connectors.
4. Build with `npm run build`.

The hosted deployment is still a local workspace backed by browser storage. Users can export JSON to move work between devices. If you need durable multi-user storage, build an adapter for your own infrastructure; the public app does not include a managed account or billing service.

## Docker

The included Dockerfile runs the same local workspace. Pass server-side keys at runtime rather than baking them into the image:

```sh
docker build -t jev-state .
docker run --rm -p 5173:5173 \
  -e TYPESAFE_API_KEY="$TYPESAFE_API_KEY" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  jev-state
```

## Verification

```sh
npm run build
npm test
npm run test:e2e
```
