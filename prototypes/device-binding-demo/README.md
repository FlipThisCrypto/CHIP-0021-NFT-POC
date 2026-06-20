# Device ⇄ Tree binding demo

A zero-dependency, runnable proof of The Orchard's identity model. It shows how a physical node is bound to its Tree NFT by a **keypair** (not a MAC), and how the Oracle rejects the attacks that would let people fake or steal Trees.

## Run

```bash
node binding-demo.mjs      # requires Node 18+ (uses built-in WebCrypto, no installs)
```

## What it demonstrates

1. **Registration** — the device generates an ECDSA P-256 keypair; its id is `SHA256(pubkey)`, signed against an Oracle-issued nonce.
2. **Signed heartbeats** — each carries a fresh nonce + monotonic sequence number.
3. **Rejected attacks** — replay, forged payload, impostor signing for another id, and double-minting the same device.
4. **Reflash recovery** — a reflashed node recovers its identity *only* by proving possession of the old private key; a thief with a new key is rejected (→ contested).

## Expected output

```
✅  10 passed, 0 failed
```

See the full protocol in [`specs/device-registration.md`](../../specs/device-registration.md).
