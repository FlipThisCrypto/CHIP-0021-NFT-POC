# The Orchard — Device Identity & Registration Protocol

- **Status:** DRAFT v0.1
- **Reference implementation:** [`prototypes/device-binding-demo/binding-demo.mjs`](../prototypes/device-binding-demo/binding-demo.mjs) (runnable, all checks pass)
- **Phase:** 3 (Device Registration)

This is the protocol that binds a physical node to a Tree NFT and proves it stays alive. It is the trust foundation everything else stands on.

## 1. Identity = a keypair, not a MAC

A MAC address is public and spoofable; GPS is spoofable too. So neither is the identity. On first boot the device:

1. Generates an **ECDSA P-256 (`secp256r1`) keypair**. The private key never leaves the device (flash-encrypted NVS, or an **ATECC608A** secure element where present — both speak P-256, so the Oracle verifies one signature type).
2. Derives its **device id** from the *public key*, not its hardware: `device_id = "TREE-" + SHA256(pubkey_hex)[:24]`. You cannot claim an id you didn't derive — the Oracle recomputes it.

MAC hash and a coarse (~5 km) geohash are reported as **secondary corroborating signals** only.

## 2. Signing & canonical form

Everything signed uses a **deterministic, key-sorted JSON serialization** so the device and Oracle hash identical bytes:

```
sig = ECDSA_P256_SHA256( stableStringify(message) )      // signature is hex(r‖s)
stableStringify: objects emitted with keys sorted lexicographically, recursively
```

## 3. Message types

### `register`
```json
{ "type": "register", "deviceId": "TREE-…", "pubHex": "04…",
  "nonce": "<oracle-issued>", "firmware": "orchard-fw-0.1.0",
  "sensors": ["temperature","humidity","gps"], "geohash": "dn4w" }
```
**Oracle checks (all must pass):** `deviceId == "TREE-"+SHA256(pubHex)[:24]` · nonce was issued, is unused, then mark used · signature valid under `pubHex` · `deviceId` not already registered (one Tree per key) → store `{pubHex, lastSeq:0}`.

### `heartbeat`
```json
{ "type": "heartbeat", "deviceId": "TREE-…", "seq": 42,
  "nonce": "<oracle-issued>", "uptimeDays": 9, "health": 96 }
```
**Oracle checks:** device known · nonce issued + unused (then mark used) · `seq > lastSeq` (monotonic) · signature valid under the stored `pubHex` → update `lastSeq`, record the Harvest.

### `recover` (reflash)
```json
{ "type": "recover", "deviceId": "TREE-…", "newPubHex": "04…", "nonce": "<oracle-issued>" }
```
Signed by the **OLD** (currently-registered) private key. **Oracle checks:** signature valid under the *stored* `pubHex` → rebind to `newPubHex`, reset `lastSeq`. If the old key can't sign (lost), the device cannot self-recover → flagged **contested** for admin review.

## 4. Anti-replay & anti-fraud (enforced in §3, summarized)

| Rule | Mechanism |
|---|---|
| No replay | Every message signs a single-use, Oracle-issued nonce |
| No rewind | Heartbeats carry a monotonic `seq` |
| No forgery | Payload + signature verified together |
| No impostor | Signature must verify under the *registered* key for that id |
| One Tree per device | `device_id` is a function of the pubkey; duplicate registration rejected |
| Reflash safety | Recovery requires proving possession of the old key |
| Sensor honesty | A sensor is `declared` on registration but only `verified` after the Oracle confirms plausible readings over N Seasons (see [growth-rules](growth-rules.md)) |
| Location | Coarse geohash is a soft signal; never the sole gate for rewards |

## 5. Lifecycle state machine

```
registered → active → idle → dormant → withered → archived
                ↑________________________________|   (regrows on verified resumption)
```
Driven by heartbeat recency (proposed): active <1 missed window · idle ≥1 · dormant days · withered weeks · archived months. Offline Trees stay visible and stop earning; they never get deleted.

## 6. Open items
- Heartbeat cadence & the exact day/week/month thresholds.
- Whether to bind the wallet at registration or at mint.
- Optional remote-attestation for `secure_element` tier (ATECC608A challenge).
- Clock handling (device timestamp vs Oracle epoch) for `seq`/replay windows.
