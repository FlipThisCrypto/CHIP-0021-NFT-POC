# The Orchard — Living Tree NFT Metadata Schema

- **Status:** DRAFT v0.1 (needs sign-off on the two items in §9)
- **Date:** 2026-06-20
- **Compatibility:** CHIP-0007 envelope (wallet/marketplace display) + an extended `orchard` namespace (our dashboard + Oracle truth)
- **Custody model:** Oracle-custodied (the Oracle wallet holds the coin during active service)

---

## 1. Why this shape

Every Chia wallet and marketplace reads the **CHIP-0007** fields (`name`, `description`, `collection`, `attributes`). So we keep a clean CHIP-0007 envelope for ecosystem display, and carry the full structured truth in a custom **`orchard`** object that our dashboard and Oracle understand. Anything in `orchard` that should *also* show in a generic wallet is mirrored into `attributes`.

Because the **Oracle holds the coin** (custody model), it can spend the NFT to update metadata itself — no custom updater puzzle needed for MVP. An "update" = host a new JSON version, **append a new metadata URI**, and bump the on-chain metadata hash. Each update increments `metadata_version`; the full history is the on-chain URI list (your `metadata_versions` archive, for free).

## 2. Three tiers + two system blocks

| Block | Who writes it | How |
|---|---|---|
| `immutable` | Set once at mint | Never appears in an update |
| `owner` | Beneficial owner | Owner request → Oracle applies (custodial) |
| `oracle` | Orchard Oracle | Oracle spends the coin it holds |
| `custody` | Oracle | Tracks holder, beneficial owner, claim status, lifecycle |
| _management_ | Oracle | `schema_version`, `metadata_version`, `updated_at_epoch` |

## 3. Full example (a mid-life Tree)

```json
{
  "format": "CHIP-0007",
  "name": "Rick's Backyard Tree",
  "description": "Planted near the garden. A Living Tree node in The Orchard network.",
  "minting_tool": "orchard-oracle/0.1.0",
  "sensitive_content": false,
  "collection": {
    "name": "The Orchard — Living Trees",
    "id": "<living-trees-collection-uuid>",
    "attributes": [
      { "type": "description", "value": "Verified physical sensor nodes in The Orchard network." },
      { "type": "website", "value": "https://theorchard.network" }
    ]
  },
  "attributes": [
    { "trait_type": "Growth Stage", "value": "Fruiting Tree" },
    { "trait_type": "Health", "value": 96 },
    { "trait_type": "Uptime Score", "value": 98.7 },
    { "trait_type": "Region", "value": "US-KY" },
    { "trait_type": "Verified Sensors", "value": 4 },
    { "trait_type": "Hardware Trust", "value": "Software Key" },
    { "trait_type": "JUICE Earned", "value": 1543.25 },
    { "trait_type": "Status", "value": "Active" }
  ],
  "orchard": {
    "schema_version": "0.1.0",
    "metadata_version": 14,
    "updated_at_epoch": 123999,

    "immutable": {
      "tree_id": "TREE-000001",
      "genesis_collection": "The Orchard — Living Trees",
      "mint_date": "2026-06-20",
      "first_seen_epoch": 123456,
      "hardware_generation": "ESP32-S3 / open-hw-r1",
      "device_public_key": "04a3f1...e2",
      "device_key_curve": "secp256r1",
      "device_mac_hash": "sha256:9c1b...",
      "original_owner_wallet": "xch1q...orig",
      "registered_region": "US-KY",
      "registered_geohash": "dn4w"
    },

    "owner": {
      "tree_name": "Rick's Backyard Tree",
      "tree_description": "Planted near the garden",
      "display_location": "Kentucky",
      "public_visibility": true
    },

    "custody": {
      "holder": "orchard_oracle",
      "beneficial_owner_wallet": "xch1q...orig",
      "claimable": true,
      "status": "active"
    },

    "oracle": {
      "firmware_version": "orchard-fw-0.1.0",
      "hardware_trust_tier": "software_key",
      "hardware_parts": ["bme280", "bh1750", "neo-6m-gps"],
      "sensors_declared": ["temperature", "humidity", "pressure", "light", "gps"],
      "sensors_verified": ["temperature", "humidity", "pressure", "gps"],
      "fruit": ["orange", "blueberry", "apple", "golden_root"],
      "uptime_score": 98.7,
      "health_score": 96,
      "growth_stage": "fruiting_tree",
      "reward_eligible": true,
      "total_juice_earned": 1543.25,
      "current_season": 7,
      "last_seen_epoch": 123999,
      "last_verified_epoch": 123999
    }
  }
}
```

> Note how `light` is **declared but not yet verified** (the BH1750 reported, but the Oracle hasn't confirmed plausible readings over enough Seasons), so **no lemon fruit yet**. Verification — not declaration — earns fruit.

## 4. Field reference

### Immutable (set at mint, never changes)
| Field | Notes |
|---|---|
| `tree_id` | Canonical key. Survives even if a CHIP-0021 fusion later changes the launcher ID. |
| `hardware_generation` | Free-form for open hardware (`"ESP32-S3 / open-hw-r1"`). |
| `device_public_key` + `device_key_curve` | secp256r1 (P-256) — see §7. |
| `device_mac_hash` | `sha256(MAC + salt)`. Secondary signal only. |
| `original_owner_wallet` | The wallet that planted it. Provenance. |
| `registered_region` / `registered_geohash` | Coarse (~5 km) to match the POC privacy model. |

### Owner-updatable (owner request → Oracle applies)
`tree_name`, `tree_description`, `display_location`, `public_visibility`.

### Oracle-updatable (Oracle spends the coin)
`firmware_version`, `hardware_trust_tier`, `hardware_parts`, `sensors_declared`, `sensors_verified`, `fruit`, `uptime_score`, `health_score`, `growth_stage`, `reward_eligible`, `total_juice_earned`, `current_season`, `last_seen_epoch`, `last_verified_epoch`.

### Custody
| Field | Values |
|---|---|
| `holder` | `orchard_oracle` while in service |
| `beneficial_owner_wallet` | The credited user; transfer = reassign this (cheap, off-chain) |
| `claimable` | Owner may request release to self-custody ("graduate") |
| `status` | `minted` → `active` → `idle` → `dormant` → `withered` → `archived` (regrows on resumed uptime) |

## 5. Growth stages (enum)
Implemented v0.1 growth stages mirror the canonical implementation in
[`lib/growth.js`](../lib/growth.js):

`seed`, `sprout`, `sapling`, `young_tree`, `fruiting_tree`.

Future art stages such as `ancient_tree` and `legendary_tree` are deferred until
the growth engine implements their thresholds. Lifecycle states such as
`dormant`, `withered`, and `archived` live under `custody.status`; they are not
growth-stage values.

## 6. Canonical fruit map — from your Layer 2 spec (needs final sign-off, §9)
This is your latest "Sensor Fruits" mapping. ⚠️ It **supersedes the earlier globe-POC legend** — `pressure` and `air_quality` differ from what the live POC currently shows (POC had pressure=🍐pear, air=🍋lemon), so the POC legend needs updating to match this, or tell me to keep the POC version instead.

| Capability | Fruit |
|---|---|
| temperature | 🍊 orange |
| humidity | 🫐 blueberry |
| light | 🍋 lemon |
| pressure | 🍎 apple |
| air_quality | 🍇 grapes |
| gas | 🥭 mango |
| gps | 🌱 golden roots (foundation, not a fruit) |
| multi-sensor cluster | 🍇 grape basket |

## 7. Device key = ECDSA P-256 (secp256r1)
Open hardware means some nodes run a **software key** (stored in flash-encrypted NVS) and some add an **ATECC608A secure element** (unclonable). The ATECC608A speaks **P-256**, so standardizing on **secp256r1** lets both tiers produce signatures the Oracle verifies the same way. This is independent of Chia's BLS keys — it's purely the device↔Oracle heartbeat channel.

## 8. How an update happens (Oracle-custody path)
1. Oracle computes the new `orchard` block + bumps `metadata_version`.
2. Hosts the new JSON (CDN/IPFS); records the hash.
3. Spends the Tree coin it holds → **appends** the new metadata URI, sets the on-chain metadata hash to the new hash.
4. Records a row in `metadata_versions` (mirrors the on-chain URI list).

## 9. Sign-off needed before this is baked into NFTs
1. **Fruit map (§6)** — confirm or adjust. It's permanent once minted.
2. **Claim/"graduate" model (§4 custody)** — confirm that beneficial ownership is tracked in metadata + DB, with optional on-chain release to self-custody (live updates pause once self-custodied).

## 10. Open follow-ups (not blocking)
- JUICE CAT asset ID + reward-pool wallet + emission policy (Phase 6).
- Living Trees collection DID (recommend a new dedicated DID; still need the **Pass collection ID** for gating).
- Whether `hardware_trust_tier` can upgrade in place (software_key → secure_element) if an owner adds a secure element later.

---

## 11. Living artwork — the render recipe

**Principle:** the image is a **deterministic render of an append-only recipe**. Each on-chain version is a verifiable milestone snapshot; anyone can replay the recipe to reproduce the exact art. That *is* the audit trail.

Add an `art` block under `orchard`:

```json
"art": {
  "renderer_version": "1.0.0",
  "dna_seed": "sha256(tree_id | device_public_key | launcher_id)",
  "species": "oak",
  "shape_variant": "crooked",
  "palette_id": "seeded",
  "render_stage": 4,
  "reputation_tier": "gold",
  "badges": ["genesis", "first_100", "one_year_uptime"],
  "sensor_quality": { "temperature": "glossy", "humidity": "normal" }
}
```

`canonical_image = render(renderer_version, dna_seed, species, shape_variant, render_stage, fruit[], reputation_tier, badges[], sensor_quality)`

### Anchored on-chain (new image version = 1 tx) vs rendered live (no tx)
| Anchored (milestones) | Live (viewer computes) |
|---|---|
| stage promotion · new verified sensor → new fruit · reputation tier change · new badge | season · health fluctuation · weather · fruit gloss |
| set once at mint: species, shape_variant, dna_seed | |

### Glance encoding — each fact on its own channel + spatial zone
| Fact | Visual channel | Zone | Read in |
|---|---|---|---|
| Age / maturity | size + silhouette + render fidelity | whole | instant |
| Identity (not rank) | species silhouette | whole | instant |
| Health | canopy fullness + saturation | canopy | ~1s |
| Season | hue shift + token (snow/petals/leaves) | global | ~1s |
| Sensors | fruit type + count | inside canopy | ~2s |
| Reputation | metal tag (copper/silver/gold) | trunk | ~2s |
| Legendary | halo / glow | around | ~2s |
| Achievements | badge ornaments | border ring | ~3s |
| GPS verified | glowing roots | base | inspect |
| Sensor quality | fruit gloss / cracks | per fruit | inspect |

**Collision fixes:** health = *fullness/saturation*; season = *hue + discrete token* (so "dying in summer" ≠ "healthy in winter"). Winter-dormant vs dead: dormant = bare but blue/snow, branches intact, tag/badges bright; dead = bare, grey, broken branches, tag dimmed. Fruit lives *inside* the silhouette; badges *around* it — different zones, no clash.

### Catches (flagged honestly)
- **Renderer versioning:** to re-derive a years-old frame's exact on-chain hash, `renderer_version` + assets must be preserved/pinned. Version and snapshot the renderer.
- **Style shift:** stages 0–4 are cheaply procedural (pixel compositor + seeded placement); stages 5–9 ("HD / living illustration") need curated hero art per species. The evolution timeline is a **content runway** — no Tree is 1 year old at launch, so you have months to make the high-stage art.
- **"Same NFT" ⇒ metadata updater, not fusion.** All evolution appends URIs on the *same* launcher ID. Reserve CHIP-0021 fusion for genuinely *combining* assets (two Trees → a grove; an event NFT → a Tree).
