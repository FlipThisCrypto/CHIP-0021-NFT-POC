// ─────────────────────────────────────────────────────────────────────────────
// The Orchard — device simulator
//
// A real client (not a mock): it generates a P-256 device with the canonical
// lib/identity.mjs, registers against a running Oracle, and streams SIGNED
// heartbeats simulating uptime + sensors coming online — so the Tree actually
// grows seed → sprout → sapling → young → fruiting.
//
// Used by the CLI, the end-to-end test (scripts/e2e.mjs), and conceptually mirrors
// the in-browser device sim in the dashboard.
//
// Run:  node oracle/sim-device.mjs --url http://localhost:8791
// ─────────────────────────────────────────────────────────────────────────────

import { generateDevice } from "../lib/identity.mjs";

async function api(baseUrl, path, method = "GET", body) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Low-level device client — gives the e2e test fine control (forgery, replay).
export async function createSimDevice(baseUrl) {
  const device = await generateDevice();
  let seq = 0;
  const nonce = async () => (await api(baseUrl, "/api/device/nonce")).nonce;

  return {
    device,
    deviceId: device.deviceId,
    async register(sensors = ["gps"], extra = {}) {
      const msg = {
        type: "register", deviceId: device.deviceId, pubHex: device.pubHex,
        nonce: await nonce(), firmware: "orchard-fw-0.1.0", sensors, geohash: "dn4w", ...extra,
      };
      return api(baseUrl, "/api/device/register", "POST", { ...msg, sig: await device.sign(msg) });
    },
    // opts.tamper: object merged into the payload AFTER signing (forgery test)
    async heartbeat(uptimeDays, sensors = ["gps"], opts = {}) {
      const msg = {
        type: "heartbeat", deviceId: device.deviceId, seq: ++seq, nonce: await nonce(),
        uptimeDays, health: opts.health ?? 96, uptimeScore: opts.uptimeScore ?? 99, sensors,
      };
      const sig = await device.sign(msg);
      return { payload: { ...msg, ...(opts.tamper || {}), sig }, send: () => api(baseUrl, "/api/device/heartbeat", "POST", { ...msg, ...(opts.tamper || {}), sig }) };
    },
    rawSend(payload) { return api(baseUrl, "/api/device/heartbeat", "POST", payload); },
    mint(name, wallet, description) {
      return api(baseUrl, "/api/tree/mint", "POST", { deviceId: device.deviceId, treeName: name, ownerWallet: wallet, description });
    },
  };
}

// High-level: plant a Tree and grow it through its whole life.
export async function plantAndGrow(baseUrl, opts = {}) {
  const { name = "Sim Tree", wallet = "xch1sim", log = () => {}, milestones } = opts;
  const ms = milestones || [
    { days: 8, sensors: ["gps", "temperature"], health: 72 },                          // sapling
    { days: 35, sensors: ["gps", "temperature", "humidity"], health: 80 },             // young (health < 85)
    { days: 95, sensors: ["gps", "temperature", "humidity", "pressure"], health: 96 }, // fruiting
    { days: 210, sensors: ["gps", "temperature", "humidity", "pressure"], health: 98 },// + gold
    { days: 400, sensors: ["gps", "temperature", "humidity", "pressure"], health: 99 },// + legendary
  ];

  const sim = await createSimDevice(baseUrl);
  log(`🌱 device ${sim.deviceId}`);

  const reg = await sim.register(["gps", "temperature", "humidity", "pressure"]);
  if (!reg.ok) throw new Error("register failed: " + JSON.stringify(reg));

  // warm-up beat → GPS verified + first heartbeat (sprout), then it can be minted
  await (await sim.heartbeat(1, ["gps"], { health: 90 })).send();
  const mint = await sim.mint(name, wallet, "Planted by the simulator");
  if (!mint.ok) throw new Error("mint failed: " + JSON.stringify(mint));
  log(`🪙 minted ${mint.tree_id} to ${wallet}`);

  let last;
  for (const m of ms) {
    for (let k = 0; k < 3; k++) last = (await (await sim.heartbeat(m.days, m.sensors, { health: m.health ?? 96 })).send()).state;
    log(
      `   day ${String(m.days).padStart(3)} → ${last.recipe.growth_stage.padEnd(13)}` +
      ` sensors:${last.verified_sensors.length} fruit:[${last.recipe.fruit.join(",")}]` +
      `${last.recipe.reputation_tier !== "none" ? " ★" + last.recipe.reputation_tier : ""} juice:${last.juice_accrued}`
    );
  }
  return { sim, deviceId: sim.deviceId, tree_id: mint.tree_id, finalState: last };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("/sim-device.mjs");
if (isMain) {
  const flag = (name, def) => {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
  };
  const url = flag("--url", "http://localhost:8791");
  const name = flag("--name", "Rick's Backyard Tree");
  const wallet = flag("--wallet", "xch1rick");
  console.log(`\n🌳 Planting against ${url}\n`);
  const out = await plantAndGrow(url, { name, wallet, log: (s) => console.log(s) });
  console.log(`\n✅ ${out.tree_id} grew to ${out.finalState.recipe.growth_stage} (${out.finalState.recipe.reputation_tier})\n`);
}
