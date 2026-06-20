# The Orchard — Growth Rules

- **Status:** DRAFT v0.1
- **Canonical implementation:** [`lib/growth.js`](../lib/growth.js) (pure functions + self-test; run `node lib/growth.js`)

These rules turn a Tree's **earned state** into its **art recipe**. The Oracle uses them to decide what to write on-chain; the renderer uses the same functions to draw. One definition, two consumers — the picture can never contradict the metadata.

## Life-stage thresholds (from your Layer-1 spec)

Cumulative — every lower gate must be met to reach a higher stage.

| Stage | Name | Requirement |
|---|---|---|
| 0 | `seed` | registered, not yet verified |
| 1 | `sprout` | GPS verified + first heartbeat |
| 2 | `sapling` | ≥ 7 days uptime + ≥ 1 verified sensor |
| 3 | `young_tree` | ≥ 30 days uptime + ≥ 2 verified sensors |
| 4 | `fruiting_tree` | the above + consistent reporting + health ≥ 85 |

Stage also drives **render resolution** (age → pixel sharpness) in the artwork.

## Fruit = sensor

Verified sensors become fruit, in canonical order; see [tree-nft-metadata §6](tree-nft-metadata.md#6-canonical-fruit-map--from-your-layer-2-spec-needs-final-sign-off-9). GPS = golden roots, not a fruit. **Verification, not declaration, earns fruit.**

## Reputation tiers (PROPOSED — needs sign-off)

| Tier | Requirement |
|---|---|
| bronze | uptime ≥ 75% + ≥ 1 Season |
| silver | uptime ≥ 90% + ≥ 3 Seasons |
| gold | uptime ≥ 97% + ≥ 6 Seasons |
| legendary | uptime ≥ 99% + ≥ 12 Seasons |

## Output

`buildRecipe()` returns the `art` block embedded in NFT metadata ([tree-nft-metadata §11](tree-nft-metadata.md#11-living-artwork--the-render-recipe)):

```json
{ "renderer_version": "1.0.0", "dna_seed": "…", "species": "oak", "shape_variant": "wide",
  "render_stage": 4, "growth_stage": "fruiting_tree",
  "fruit": ["orange","blueberry","apple"], "golden_roots": true,
  "reputation_tier": "gold", "badges": [], "health": 96, "season": 1 }
```

`image = render(recipe)` — deterministic, so any party can reproduce a Tree's exact art at any point in its life.
