# monee

A private, offline budget tracker that installs to your phone's home screen.
Your data stays on the device: no account, no server, no bank connections.

## Run it locally

```bash
pnpm install
cp .env.example .env.local   # enables the [TEST] master PIN for local testing
pnpm dev
```

## Tests and build

```bash
pnpm test       # unit tests
pnpm typecheck  # TypeScript
pnpm build      # release guard, typecheck, production bundle
```

## Deploy to Vercel (test build)

1. Import this repo in Vercel. The settings in `vercel.json` are picked up automatically.
2. In **Settings → Environment Variables**, add `VITE_TEST_MASTER_PIN` = `true` for Production.
   The master PIN is `0000`. It lets you reset a forgotten PIN, so it is for testing only.
3. Install from the stable `*.vercel.app` URL on your phone. Each URL is a separate
   origin with its own data, so keep using the same one.

## Before any real release

- Remove `VITE_TEST_MASTER_PIN` from Vercel and set `PRODUCTION_RELEASE=true`.
  `scripts/check-release.mjs` then refuses to build if the master PIN is still on.
- Replace the master PIN with a recovery code (see `PLAN.md` §5.2).

See [PLAN.md](PLAN.md) for the full design and security model.
