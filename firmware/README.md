# `firmware/` — Tree node firmware *(planned, not started)*

Runs on the physical sensor node and makes it a verifiable Tree.

- **Targets:** ESP32 / ESP32-S3 (**open hardware** — any compatible board).
- **Suggested tooling:** ESP-IDF or Arduino-core · mbedTLS / micro-ecc for ECDSA **P-256** · optional **ATECC608A** secure element for the `secure_element` trust tier.

**Responsibilities:** generate & protect a P-256 identity keypair · sign heartbeats over Oracle nonces · auto-detect sensors & report a manifest · report MAC hash + coarse GPS · retry/queue when the Oracle is unreachable · safe reflash + identity recovery.

Protocol it must implement: [`specs/device-registration.md`](../specs/device-registration.md). A simulated device that follows the same protocol is in [`prototypes/device-binding-demo/`](../prototypes/device-binding-demo/).
