// The Orchard NFT card layer.
//
// Keep this separate from growth.js: growth.js derives the clean art recipe,
// while this file formats the standardized NFT card/live-data layer that can
// update around the art.

export const COLLECTION_NAME = "The Orchard Living Trees";
export const BASE_IMAGE_SIZE = 1024;
export const BASE_IMAGE_RESOLUTION = `${BASE_IMAGE_SIZE}x${BASE_IMAGE_SIZE}`;

export const STAGE_CARD_PROFILE = [
  { stage: 0, stage_name: "Seed", bit_depth: "2-bit", resolution: "8x8", palette_size: 2 },
  { stage: 1, stage_name: "Sprout", bit_depth: "4-bit", resolution: "32x32", palette_size: 4 },
  { stage: 2, stage_name: "Sapling", bit_depth: "8-bit", resolution: "64x64", palette_size: 8 },
  { stage: 3, stage_name: "Young Tree", bit_depth: "16-bit", resolution: "128x128", palette_size: 16 },
  { stage: 4, stage_name: "Mature Tree", bit_depth: "32-bit", resolution: "512x512", palette_size: 256 },
];

export const SENSOR_LABELS = {
  gps: "GPS",
  temperature: "Temp",
  humidity: "Humidity",
  pm: "PM",
  light: "Light",
  pressure: "Pressure",
  gas: "Gas",
  air_quality: "Air Quality",
};

export const FRUIT_LABELS = {
  golden_root: "Golden Root",
  orange: "Orange",
  blueberry: "Blueberry",
  grapes: "Grapes",
  lemon: "Lemon",
  apple: "Apple",
  mango: "Mango",
};

export function getStageCardProfile(stage = 0) {
  return STAGE_CARD_PROFILE[Math.max(0, Math.min(STAGE_CARD_PROFILE.length - 1, Number(stage) || 0))];
}

export function getUpscaleFactor(resolution) {
  const [width, height] = String(resolution)
    .split("x")
    .map((value) => Number(value));
  if (!width || width !== height || BASE_IMAGE_SIZE % width !== 0) return null;
  return BASE_IMAGE_SIZE / width;
}

export function buildCardMetadata({
  tree_id = "TREE-000001",
  tree_name = "Unnamed Tree",
  stage = 0,
  species = "Oak",
  growth_status = "Registered",
  health_score = 0,
  uptime_score = 0,
  sensors_verified = [],
  fruit_unlocked = [],
  firmware_version = "orchard-fw-0.1.0",
  region = "US-KY",
  reward_eligible = false,
  last_verified_epoch = 0,
} = {}) {
  const profile = getStageCardProfile(stage);
  return {
    collection: COLLECTION_NAME,
    tree_id,
    tree_name,
    stage: profile.stage,
    stage_name: profile.stage_name,
    bit_depth: profile.bit_depth,
    resolution: profile.resolution,
    native_resolution: profile.resolution,
    base_image_resolution: BASE_IMAGE_RESOLUTION,
    upscale_factor: getUpscaleFactor(profile.resolution),
    palette_size: profile.palette_size,
    species,
    growth_status,
    health_score,
    uptime_score,
    sensors_verified,
    fruit_unlocked,
    firmware_version,
    region,
    reward_eligible,
    last_verified_epoch,
  };
}

export function splitCardFields(metadata) {
  return {
    art_generation_fields: {
      stage: metadata.stage,
      bit_depth: metadata.bit_depth,
      native_resolution: metadata.native_resolution,
      base_image_resolution: metadata.base_image_resolution,
      upscale_factor: metadata.upscale_factor,
      species: metadata.species,
      pose: null,
      visual_style: "Heartwood pixel tree",
      palette: `${metadata.palette_size} colors`,
      background: "seasonal orchard field",
      fruit_slots: metadata.fruit_unlocked,
    },
    live_data_fields: {
      tree_id: metadata.tree_id,
      owner_name: metadata.tree_name,
      health: metadata.health_score,
      uptime: metadata.uptime_score,
      sensors: metadata.sensors_verified,
      epoch: metadata.last_verified_epoch,
      rewards: metadata.reward_eligible,
      firmware: metadata.firmware_version,
      region: metadata.region,
    },
  };
}

export function buildCardDisplay(metadata) {
  return {
    header_left: `STAGE ${metadata.stage}: ${metadata.stage_name.toUpperCase()}`,
    header_right: `${metadata.bit_depth.toUpperCase()} CHARACTER`,
    bottom_left: {
      label: "PALETTE",
      palette: `${metadata.palette_size} COLORS`,
      resolution: `RESOLUTION: ${metadata.native_resolution} -> ${metadata.base_image_resolution}`,
    },
    bottom_right: {
      tree_id: `TREE ID: ${metadata.tree_id}`,
      health: `HEALTH: ${metadata.health_score}%`,
      uptime: `UPTIME: ${metadata.uptime_score}%`,
      sensors: `SENSORS: ${metadata.sensors_verified.length} VERIFIED`,
    },
    status_bar: [
      metadata.sensors_verified.includes("gps") ? "GPS VERIFIED" : "GPS PENDING",
      metadata.reward_eligible ? "REWARDS ACTIVE" : "REWARDS LOCKED",
      `LAST SEEN: EPOCH ${metadata.last_verified_epoch}`,
    ].join(" | "),
  };
}

if (typeof window !== "undefined") {
  window.OrchardCard = {
    COLLECTION_NAME,
    BASE_IMAGE_SIZE,
    BASE_IMAGE_RESOLUTION,
    STAGE_CARD_PROFILE,
    SENSOR_LABELS,
    FRUIT_LABELS,
    getStageCardProfile,
    getUpscaleFactor,
    buildCardMetadata,
    splitCardFields,
    buildCardDisplay,
  };
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("/card.js");

if (isMain) {
  const metadata = buildCardMetadata({
    tree_id: "TREE-000001",
    tree_name: "Rick's Backyard Tree",
    stage: 2,
    species: "Oak",
    growth_status: "Active",
    health_score: 96,
    uptime_score: 98.7,
    sensors_verified: ["gps", "temperature", "humidity"],
    fruit_unlocked: ["golden_root", "orange", "blueberry"],
    reward_eligible: true,
    last_verified_epoch: 123456,
  });
  const display = buildCardDisplay(metadata);
  const split = splitCardFields(metadata);
  const ok =
    metadata.collection === COLLECTION_NAME &&
    metadata.stage_name === "Sapling" &&
    metadata.bit_depth === "8-bit" &&
    metadata.resolution === "64x64" &&
    metadata.base_image_resolution === "1024x1024" &&
    metadata.upscale_factor === 16 &&
    display.header_left === "STAGE 2: SAPLING" &&
    display.bottom_left.resolution === "RESOLUTION: 64x64 -> 1024x1024" &&
    split.live_data_fields.tree_id === "TREE-000001";

  console.log("\nThe Orchard card layer self-test\n");
  console.log(`${ok ? "PASS" : "FAIL"} standardized NFT card metadata`);
  process.exit(ok ? 0 : 1);
}
