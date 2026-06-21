# The Orchard NFT Card Output

- **Status:** DRAFT v0.1
- **Canonical implementation:** [`lib/card.js`](../lib/card.js)
- **Purpose:** keep clean artwork separate from the standardized live-data card
  layer shown around it.

## Rule

Use the rendered Tree image as the **clean art layer**. Add collection, stage,
technical display traits, and live Orchard data afterward as a standardized NFT
card/UI layer.

All clean base images are finalized at **1024x1024** before the card/text overlay
is added. Stage resolution is the native pixel grid used to generate the art. For
example, an 8-bit `64x64` Sapling is rendered on a `64x64` native grid, then
nearest-neighbor upscaled to `1024x1024`, then the card layer is composed around
or over that finalized base image.

This keeps the art generation stable while allowing live Orchard data to update
later without regenerating the whole image.

## Required fields

Every card output includes:

| Field | Example |
|---|---|
| Collection | The Orchard Living Trees |
| Tree ID | TREE-000001 |
| Stage | 0 Seed / 1 Sprout / 2 Sapling / 3 Young Tree / 4 Mature Tree |
| Bit Depth | 2-bit / 4-bit / 8-bit / 16-bit / 32-bit |
| Resolution | 8x8 / 32x32 / 64x64 / 128x128 / 512x512 |
| Base Image Resolution | 1024x1024 |
| Palette | 2 colors / 4 colors / 8 colors / 16 colors / 256 colors |
| Tree Name | user chosen |
| Species/DNA | Oak / Maple / Pine / etc. |
| Growth Status | Registered / Verified / Active / Dormant / Withered |
| Health Score | 0-100% |
| Uptime Score | 0-100% |
| Sensors Verified | GPS, Temp, Humidity, PM, Light, Pressure, Gas |
| Fruit Unlocked | Orange, Blueberry, Grapes, Lemon, Apple, etc. |
| Firmware Version | orchard-fw-x.x.x |
| Region | US-KY |
| Last Verified Epoch | numeric epoch |

## Stage display profile

| Stage | Display name | Bit depth | Native resolution | Upscale | Base image | Palette |
|---|---|---|---|---|---|---|
| 0 | Seed | 2-bit | 8x8 | 128x | 1024x1024 | 2 colors |
| 1 | Sprout | 4-bit | 32x32 | 32x | 1024x1024 | 4 colors |
| 2 | Sapling | 8-bit | 64x64 | 16x | 1024x1024 | 8 colors |
| 3 | Young Tree | 16-bit | 128x128 | 8x | 1024x1024 | 16 colors |
| 4 | Mature Tree | 32-bit | 512x512 | 2x | 1024x1024 | 256 colors |

Note: `Mature Tree` is the card display label for stage 4. The current growth
engine may still use `fruiting_tree` internally as its canonical recipe value.

## Visual layout

```text
STAGE 2: SAPLING                                      8-BIT CHARACTER

                         [clean Tree artwork]

PALETTE                                      TREE ID: TREE-000001
8 COLORS                                     HEALTH: 96%
RESOLUTION: 64x64 -> 1024x1024               UPTIME: 98.7%
                                             SENSORS: 3 VERIFIED

GPS VERIFIED | REWARDS ACTIVE | LAST SEEN: EPOCH 123456
```

## Metadata payload

```json
{
  "collection": "The Orchard Living Trees",
  "tree_id": "TREE-000001",
  "tree_name": "Rick's Backyard Tree",
  "stage": 2,
  "stage_name": "Sapling",
  "bit_depth": "8-bit",
  "resolution": "64x64",
  "native_resolution": "64x64",
  "base_image_resolution": "1024x1024",
  "upscale_factor": 16,
  "palette_size": 8,
  "species": "Oak",
  "growth_status": "Active",
  "health_score": 96,
  "uptime_score": 98.7,
  "sensors_verified": ["gps", "temperature", "humidity"],
  "fruit_unlocked": ["golden_root", "orange", "blueberry"],
  "firmware_version": "orchard-fw-0.1.0",
  "region": "US-KY",
  "reward_eligible": true,
  "last_verified_epoch": 123456
}
```

## Field separation

Art generation fields:

```text
stage
bit_depth
species
pose
visual style
palette
native resolution
base image resolution
upscale factor
background
fruit slots
```

Live data fields added after:

```text
tree_id
owner name
health
uptime
sensors
epoch
rewards
firmware
region
```

The Oracle should update live data without mutating the Tree DNA or structural
art recipe. Milestone art changes still create a new recipe/image version.
