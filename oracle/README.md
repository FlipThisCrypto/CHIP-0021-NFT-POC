# `oracle/` — The truth layer *(planned, not started)*

The backend that makes Trees trustworthy. Verifies devices, validates sensor claims, computes uptime, gates rewards, and writes the Tree's on-chain state.

- **Stack (planned):** FastAPI · SQLite → PostgreSQL · background workers (mint / metadata / uptime).
- **Contract:** [`specs/oracle-api.md`](../specs/oracle-api.md) (endpoints + DB schema), [`specs/device-registration.md`](../specs/device-registration.md) (signature protocol), [`lib/growth.js`](../lib/growth.js) (state → recipe).

**Responsibilities:** wallet auth + Orchard Pass check · device registration & anti-duplicate · sensor verification · uptime & reward eligibility · metadata-update queue · NFT mint queue · dashboard API · admin & fraud tools.

The crypto core is already proven in [`prototypes/device-binding-demo/`](../prototypes/device-binding-demo/) — this service productionizes it.
