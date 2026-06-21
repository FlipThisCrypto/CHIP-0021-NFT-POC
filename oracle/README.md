# `oracle/` — The truth layer *(testbed: BUILT & runnable)*

A zero-dependency Node implementation of the Orchard Oracle — enough to run the **whole flow end to end** on your machine. State is in-memory (resets on restart); this is a testbed, not production.

## Run it

```bash
npm run oracle     # starts the Oracle at http://localhost:8791 (also serves the dashboard)
npm run sim        # drives a simulated device against it — watch a Tree grow seed→legendary
npm run e2e        # automated end-to-end test (boots the Oracle in-process, 27 assertions)
```

Then open **http://localhost:8791** and click **🌱 Plant a Tree** — your browser becomes a flashed device and signs real heartbeats.

## What it does

- **Never trusts an unsigned device message.** `register`, `heartbeat`, and `recover` all verify ECDSA P-256 signatures via the canonical [`lib/identity.mjs`](../lib/identity.mjs).
- Derives growth from [`lib/growth.js`](../lib/growth.js) and card metadata from [`lib/card.js`](../lib/card.js) — the **same** source of truth the dashboard renders from, so the picture can't disagree with the data.
- Verifies sensors over repeated readings, advances growth stages, accrues **JUICE** for proven uptime, and logs rejected attacks (forgery / replay / duplicate / unauthorized mint).
- Endpoint contract: [`specs/oracle-api.md`](../specs/oracle-api.md). Signature protocol: [`specs/device-registration.md`](../specs/device-registration.md).

## Files

- **`server.mjs`** — the HTTP API + static host. `createServer()` is exported so tests can boot it in-process on an ephemeral port.
- **`sim-device.mjs`** — a *real* client (not a mock): generates a P-256 device and streams signed heartbeats. Exposes `createSimDevice()` (granular, used by the e2e attack tests) and `plantAndGrow()`.

## Still mocked (vs. production)

A persistent database, real **Chia wallet RPC** minting, on-chain metadata anchoring, the real on-chain **Orchard Pass** lookup, and **DataLayer**. The testbed mocks the chain so everything else — identity, growth, rewards, dashboards — can be exercised for real. Production direction: FastAPI/Postgres + workers, per [`specs/oracle-api.md`](../specs/oracle-api.md).
