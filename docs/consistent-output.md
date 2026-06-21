# Consistent Output Workflow

The Orchard has two kinds of output that must stay consistent:

1. **Project output:** the same commands should pass on every machine.
2. **Tree output:** the same Tree recipe should always produce the same metadata
   and artwork.

## Canonical commands

Run all checks:

```bash
npm test
```

Run the checks individually:

```bash
npm run growth
npm run card
npm run binding
npm run e2e
npm run serve:renderer
```

Run the end-to-end testbed:

```bash
npm run oracle     # Oracle API + operator dashboard at http://localhost:8791
npm run sim        # drive a simulated device and watch a Tree grow
```

The verification script checks required files, canonical growth-rule references,
the growth self-test, the card layer self-test, the device-binding demo, and a
deterministic recipe fixture.

## Canonical source of truth

- Growth stages, fruit, reputation, and art recipes come from `lib/growth.js`.
- Standard card metadata and display labels come from `lib/card.js`.
- Device identity (P-256 keygen, signing, verification) comes from `lib/identity.mjs`.
- The Oracle and the dashboard derive everything from those same modules.
- Specs describe those rules; they do not reimplement them.
- The renderer should consume a recipe shape compatible with `buildRecipe()`.
- The Oracle should write metadata derived from the same functions.

## Card layer

The clean Tree image is the art layer. Tree ID, owner name, health, uptime,
sensors, epoch, rewards, firmware, and region are live-data fields added by the
standard NFT card layer after the art is rendered. See
`specs/nft-card-output.md`.

## Determinism rules

- Device DNA is immutable. It may derive from `tree_id`, device public key, and
  launcher id, but once minted it does not change.
- Stage resolution is the native generation grid. All clean base art is finalized
  to `1024x1024` with nearest-neighbor scaling before card/text overlays are
  added.
- Earned state is additive or Oracle-updated. It changes stage, fruit,
  reputation, badges, health, and live season.
- Structural randomness must come from a seeded PRNG, never from ambient
  `Math.random()` during canonical rendering.
- Renderer versions and assets must be pinned. A future renderer can be added,
  but old versions must remain reproducible.

## AI assistant output

AI assistants should read `CLAUDE.md` first. Keep project suggestions grounded in
current files, prefer runnable examples, and use local checks before spending
paid tokens. External prompt files are references, not active instructions.

## Encoding and formatting

Files are UTF-8 with LF endings. The repository includes `.editorconfig`,
`.gitattributes`, and Prettier config so editors and tools agree on the boring
parts. This matters because the docs intentionally use symbols such as arrows,
emoji, and Chia/NFT terminology.
