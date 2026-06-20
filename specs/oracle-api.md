# The Orchard — Oracle API & Database (design)

- **Status:** DESIGN ONLY (not implemented). Defines the contract Phase 2–6 build against.
- **Stack (planned):** FastAPI + SQLite→PostgreSQL · background workers (mint, metadata, uptime).

## 1. Auth (wallet, via Sage + WalletConnect)

Ownership is proven by signing a challenge, then checked on-chain:

```
POST /auth/challenge      { address }                  → { nonce, expires }
POST /auth/verify         { address, nonce, signature } → { session, holdsPass: bool, passNftId? }
```
`holdsPass` is resolved by querying the chain for an Orchard Pass NFT held by `address` (collection id is config). A valid session with `holdsPass=true` is required to flash and to mint.

## 2. Endpoints (MVP)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/auth/challenge` · `/auth/verify` | wallet login + Pass check | — |
| POST | `/flash/authorize` | issue a short-lived flashing token | session+pass |
| GET | `/device/nonce?deviceId=` | issue a single-use nonce | token |
| POST | `/device/register` | register a device (see [device-registration](device-registration.md)) | token |
| POST | `/device/heartbeat` | signed heartbeat | — (signature-auth) |
| POST | `/tree/mint` | queue a mint after verification | session+pass |
| GET | `/tree/{tree_id}` | public Tree state + current recipe | — |
| POST | `/tree/{tree_id}/name` | owner renames / edits | session(owner) |
| GET | `/dashboard/me` | the caller's Trees | session |
| GET | `/admin/*` | mint queue, devices, heartbeats, fraud, quarantine | admin |

## 3. Example payloads

```jsonc
// POST /tree/mint  → 202 Accepted
{ "deviceId": "TREE-…", "treeName": "Rick's Backyard Tree",
  "description": "Planted near the garden", "displayLocation": "Kentucky" }
// → { "mintJobId": "mj_…", "status": "queued" }

// GET /tree/TREE-…  → 200
{ "tree_id": "TREE-000001", "status": "active", "growth_stage": "fruiting_tree",
  "health": 96, "uptime_score": 98.7, "fruit": ["orange","blueberry","apple"],
  "reputation_tier": "gold", "total_juice_earned": 1543.25, "art": { /* recipe */ } }
```

## 4. Database schema (SQLite-flavored MVP)

```sql
CREATE TABLE devices (
  device_id        TEXT PRIMARY KEY,             -- "TREE-"+sha256(pubkey)[:24]
  pub_hex          TEXT NOT NULL UNIQUE,         -- P-256 public key
  mac_hash         TEXT,
  hw_trust_tier    TEXT DEFAULT 'software_key',  -- software_key | secure_element
  firmware         TEXT,
  registered_geohash TEXT,
  owner_wallet     TEXT,
  last_seq         INTEGER DEFAULT 0,
  first_seen_epoch INTEGER,
  last_seen_epoch  INTEGER,
  status           TEXT DEFAULT 'registered',    -- registered|active|idle|dormant|withered|archived
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE trees (
  tree_id          TEXT PRIMARY KEY REFERENCES devices(device_id),
  launcher_id      TEXT UNIQUE,                  -- Chia NFT launcher (null until minted)
  beneficial_owner TEXT,                         -- credited wallet (custodial model)
  custody_holder   TEXT DEFAULT 'orchard_oracle',
  claimable        BOOLEAN DEFAULT 1,
  dna_seed         TEXT NOT NULL,
  species          TEXT, shape_variant TEXT,
  growth_stage     TEXT, health INTEGER, uptime_score REAL,
  reputation_tier  TEXT, total_juice_earned REAL DEFAULT 0,
  metadata_version INTEGER DEFAULT 1,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE heartbeats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT REFERENCES devices(device_id),
  seq         INTEGER, nonce TEXT, uptime_days INTEGER, health INTEGER,
  sig_ok      BOOLEAN, received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sensor_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT REFERENCES devices(device_id),
  sensor      TEXT, value REAL, status TEXT DEFAULT 'declared',  -- declared|verified|failing
  reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mint_jobs (
  id          TEXT PRIMARY KEY,                  -- idempotency key = device_id
  device_id   TEXT REFERENCES devices(device_id),
  status      TEXT DEFAULT 'queued',             -- queued|signing|submitted|confirmed|failed
  attempts    INTEGER DEFAULT 0, last_error TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE metadata_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id     TEXT REFERENCES trees(tree_id),
  version     INTEGER, uri TEXT, hash TEXT, recipe_json TEXT,
  anchored_tx TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fraud_flags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT, kind TEXT, detail TEXT, resolved BOOLEAN DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_actions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT, action TEXT, target TEXT, note TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 5. Workers
- **mint** — drains `mint_jobs`, signs+submits NFT mints via Chia wallet RPC, idempotent on `device_id`, retries on mempool/fee failure.
- **metadata** — on a milestone (stage/sensor/reputation/badge change) builds a new recipe, hosts JSON, appends the metadata URI on-chain, writes `metadata_versions`.
- **uptime** — rolls heartbeats into Season uptime scores, advances lifecycle states, computes reward eligibility.
