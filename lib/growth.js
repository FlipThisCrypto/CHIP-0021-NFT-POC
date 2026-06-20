// ─────────────────────────────────────────────────────────────────────────────
// The Orchard — growth rules (single source of truth)
//
// Pure, deterministic functions that turn a Tree's EARNED STATE into its art
// recipe. The Oracle uses these to decide what to write on-chain; the renderer
// uses the same rules to draw. One definition, two consumers — so the picture
// can never disagree with the metadata.
//
// Zero dependencies. Importable in Node (ESM) and the browser (also attaches to
// window.OrchardGrowth). Run `node growth.js` for a self-test.
// ─────────────────────────────────────────────────────────────────────────────

export const STAGES = ["seed", "sprout", "sapling", "young_tree", "fruiting_tree"];
export const REPUTATION = ["none", "bronze", "silver", "gold", "legendary"];

// canonical fruit = sensor map (Layer 2 spec). gps is roots, not a fruit.
export const FRUIT = {
  temperature: "orange",
  humidity: "blueberry",
  light: "lemon",
  pressure: "apple",
  air_quality: "grapes",
  gas: "mango",
};

// Stage thresholds — taken directly from the Layer-1 spec. Cumulative: a Tree
// must satisfy every lower gate to reach a higher stage.
//   0 seed     · registered, not yet verified
//   1 sprout   · GPS verified + first heartbeat
//   2 sapling  · >= 7 days uptime + >= 1 verified sensor
//   3 young    · >= 30 days uptime + >= 2 verified sensors
//   4 fruiting · the above + consistent reporting + good health
export const HEALTH_FOR_FRUITING = 85; // "good health score" (proposed — tune)

export function deriveStage(s = {}) {
  const up = s.uptimeDays || 0;
  const sensors = s.verifiedSensorCount ?? (s.verifiedSensors ? s.verifiedSensors.length : 0);
  const health = s.healthScore || 0;
  if (up >= 30 && sensors >= 2 && s.consistentReporting && health >= HEALTH_FOR_FRUITING) return 4;
  if (up >= 30 && sensors >= 2) return 3;
  if (up >= 7 && sensors >= 1) return 2;
  if (s.gpsVerified && s.firstHeartbeat) return 1;
  return 0;
}

export function deriveFruit(verifiedSensors = []) {
  return Object.keys(FRUIT).filter((k) => verifiedSensors.includes(k)).map((k) => FRUIT[k]);
}

export function hasGoldenRoots(verifiedSensors = []) {
  return verifiedSensors.includes("gps");
}

// Reputation thresholds (PROPOSED — the Layer-7 spec didn't fix numbers).
// A "Season" is one uptime epoch.
export function deriveReputation(s = {}) {
  const u = s.uptimeScore || 0;
  const seasons = s.seasons || 0;
  if (u >= 99 && seasons >= 12) return 4; // legendary
  if (u >= 97 && seasons >= 6) return 3;  // gold
  if (u >= 90 && seasons >= 3) return 2;  // silver
  if (u >= 75 && seasons >= 1) return 1;  // bronze
  return 0;
}

// Assemble the `art` recipe block that goes into NFT metadata (see
// specs/tree-nft-metadata.md §11). The image is render(recipe) — deterministic.
export function buildRecipe({ dna_seed, species, shape_variant, renderer_version = "1.0.0", state = {} }) {
  const stageIdx = deriveStage(state);
  const verified = state.verifiedSensors || [];
  return {
    renderer_version,
    dna_seed,
    species,
    shape_variant,
    render_stage: stageIdx,
    growth_stage: STAGES[stageIdx],
    fruit: deriveFruit(verified),
    golden_roots: hasGoldenRoots(verified),
    reputation_tier: REPUTATION[deriveReputation(state)],
    badges: state.badges || [],
    health: state.healthScore ?? 0,
    season: state.season ?? null,
  };
}

// browser convenience
if (typeof window !== "undefined") {
  window.OrchardGrowth = { STAGES, REPUTATION, FRUIT, deriveStage, deriveFruit, hasGoldenRoots, deriveReputation, buildRecipe };
}

// ── self-test ────────────────────────────────────────────────────────────────
const isMain = typeof process !== "undefined" && process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("/growth.js");
if (isMain) {
  const cases = [
    ["fresh registration", { registered: true }],
    ["gps + first heartbeat", { gpsVerified: true, firstHeartbeat: true, verifiedSensors: ["gps"] }],
    ["1 week, temp verified", { uptimeDays: 7, verifiedSensors: ["gps", "temperature"], healthScore: 90 }],
    ["1 month, 3 sensors", { uptimeDays: 31, verifiedSensors: ["gps", "temperature", "humidity"], healthScore: 80 }],
    ["mature & healthy", { uptimeDays: 120, verifiedSensors: ["gps", "temperature", "humidity", "pressure"], healthScore: 96, consistentReporting: true, uptimeScore: 98, seasons: 7 }],
    ["mature & legendary", { uptimeDays: 400, verifiedSensors: ["gps", "temperature", "humidity", "pressure", "light"], healthScore: 99, consistentReporting: true, uptimeScore: 99.5, seasons: 14 }],
  ];
  console.log("\n🌳  growth rules self-test\n");
  let ok = 0;
  const expectStage = [0, 1, 2, 3, 4, 4];
  cases.forEach(([label, state], i) => {
    const r = buildRecipe({ dna_seed: "demo", species: "oak", shape_variant: "wide", state });
    const good = r.render_stage === expectStage[i];
    if (good) ok++;
    console.log(`   ${good ? "✓" : "✗"}  ${label.padEnd(22)} → ${r.growth_stage.padEnd(14)} fruit:[${r.fruit.join(",")}]${r.golden_roots ? " +roots" : ""} ${r.reputation_tier !== "none" ? "★" + r.reputation_tier : ""}`);
  });
  console.log(`\n${ok === cases.length ? "✅" : "❌"}  ${ok}/${cases.length} stages as expected\n`);
  process.exit(ok === cases.length ? 0 : 1);
}
