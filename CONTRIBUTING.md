# Contributing to The Orchard — Living Trees

This is an early, openly-built proof-of-concept. The lead is **learning Chialisp and web dev in the open**, so the bar is: *clear, complete, working examples over clever abstractions.* Heavily-commented code is a feature.

## What runs today (verify it in 2 minutes)

```bash
# Run the full consistency suite
npm test

# 1. The device⇄Tree binding model (zero deps, Node 18+)
node prototypes/device-binding-demo/binding-demo.mjs     # → ✅ 10 passed, 0 failed

# 2. The growth-rules engine
node lib/growth.js                                        # → ✅ 6/6 stages as expected

# 3. The artwork renderer (open in Chrome/Edge, or:)
python -m http.server 8137 --directory prototypes/living-tree-renderer
#   then open http://localhost:8137
```

## Where to start

1. Read [`specs/tree-nft-metadata.md`](specs/tree-nft-metadata.md) — the schema everything keys off.
2. Skim the [README](README.md) for the architecture and locked decisions.
3. Pick from the [roadmap](README.md#roadmap). The next foundational build is the **Oracle** implementing [`specs/device-registration.md`](specs/device-registration.md) + [`specs/oracle-api.md`](specs/oracle-api.md).

AI assistants should also read [`CLAUDE.md`](CLAUDE.md) for the project workflow and external prompt-reference policy.
For deterministic output rules, read [`docs/consistent-output.md`](docs/consistent-output.md).

## Ground rules

- **Don't change immutable NFT fields or the fruit map without sign-off** — those get baked into minted NFTs permanently. Open sign-offs are tracked in the [README](README.md#pending-sign-offs).
- The **Oracle and renderer must agree** — derive growth/fruit/reputation from [`lib/growth.js`](lib/growth.js), never reimplement the thresholds.
- Keep specs and code in sync; a PR that changes behavior updates the relevant `specs/` doc in the same change.
- Be honest in docs about what's *built* vs *designed*.

## Style

- JS/TS: small pure functions, descriptive names, comments that explain *why*.
- Python (Oracle): FastAPI + type hints; SQLite locally.
- Commits: imperative, scoped (`oracle:`, `firmware:`, `web:`, `art:`, `spec:`).
