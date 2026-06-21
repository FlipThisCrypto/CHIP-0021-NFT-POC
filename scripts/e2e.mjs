// ─────────────────────────────────────────────────────────────────────────────
// The Orchard — end-to-end test
//
// Boots the Oracle in-process on an ephemeral port and drives the WHOLE flow with
// the device simulator, asserting both the happy path (register → grow → mint →
// dashboard → JUICE) and that the Oracle rejects forgery, replay, duplicate mints,
// and unauthorized mints.
//
// Run:  node scripts/e2e.mjs   (also runs as part of `npm test`)
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from "../oracle/server.mjs";
import { createSimDevice } from "../oracle/sim-device.mjs";

let pass = 0, fail = 0;
function ok(label, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? `  :: ${detail}` : ""}`); }
}

const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const api = (p, m = "GET", b) =>
  fetch(base + p, { method: m, headers: b ? { "Content-Type": "application/json" } : undefined, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

console.log(`\n🌳 end-to-end test against in-process Oracle (${base})\n`);

try {
  const sim = await createSimDevice(base);

  // ── registration + identity ──
  const reg = await sim.register(["gps", "temperature", "humidity", "pressure"]);
  ok("device registers with a valid signature", reg.ok, JSON.stringify(reg));
  ok("device id is derived from the public key", reg.deviceId === sim.deviceId);

  const seedState = await api(`/api/tree/${sim.deviceId}`);
  ok("a freshly registered device is a seed", seedState.recipe.growth_stage === "seed", seedState.recipe.growth_stage);

  // ── first heartbeat → sprout ──
  const sprout = (await (await sim.heartbeat(1, ["gps"], { health: 90 })).send()).state;
  ok("gps verified + first heartbeat → sprout", sprout.recipe.growth_stage === "sprout", sprout.recipe.growth_stage);

  // ── attacks the Oracle MUST reject ──
  const forged = await (await sim.heartbeat(2, ["gps"], { tamper: { health: 5 } })).send();
  ok("forged heartbeat rejected", forged.ok === false && forged.why === "bad-signature", JSON.stringify(forged));

  const hb = await sim.heartbeat(2, ["gps"], {});
  ok("fresh heartbeat accepted", (await hb.send()).ok === true);
  const replay = await sim.rawSend(hb.payload);
  ok("replayed heartbeat rejected", replay.ok === false && replay.why === "replayed-nonce", JSON.stringify(replay));

  const dupNonce = (await api("/api/device/nonce")).nonce;
  const dupMsg = { type: "register", deviceId: sim.deviceId, pubHex: sim.device.pubHex, nonce: dupNonce, firmware: "x", sensors: [], geohash: "dn4w" };
  const dup = await api("/api/device/register", "POST", { ...dupMsg, sig: await sim.device.sign(dupMsg) });
  ok("duplicate device registration rejected (one Tree per key)", dup.ok === false && dup.why === "already-registered", JSON.stringify(dup));

  // ── mint ──
  const mint = await sim.mint("E2E Tree", "xch1e2e", "planted by the test");
  ok("Tree mints to a Pass holder", mint.ok && /^TREE-\d{6}$/.test(mint.tree_id), JSON.stringify(mint));

  // ── growth through every stage ──
  const beat = async (days, sensors, health) => {
    let st;
    for (let k = 0; k < 3; k++) st = (await (await sim.heartbeat(days, sensors, { health })).send()).state;
    return st;
  };
  const sapling = await beat(8, ["gps", "temperature"], 72);
  ok("7 days + 1 verified sensor → sapling", sapling.recipe.growth_stage === "sapling", sapling.recipe.growth_stage);
  ok("verified temperature unlocks the orange fruit", sapling.recipe.fruit.includes("orange"));

  const young = await beat(35, ["gps", "temperature", "humidity"], 80);
  ok("30 days + 2 sensors, health < 85 → young_tree", young.recipe.growth_stage === "young_tree", young.recipe.growth_stage);

  const fruiting = await beat(95, ["gps", "temperature", "humidity", "pressure"], 96);
  ok("consistent reporting + good health → fruiting_tree", fruiting.recipe.growth_stage === "fruiting_tree", fruiting.recipe.growth_stage);
  ok("verified pressure unlocks the apple fruit", fruiting.recipe.fruit.includes("apple"));
  ok("verified gps shows as golden roots", fruiting.recipe.golden_roots === true);

  const legendary = await beat(400, ["gps", "temperature", "humidity", "pressure"], 99);
  ok("long, reliable uptime → legendary reputation", legendary.recipe.reputation_tier === "legendary", legendary.recipe.reputation_tier);

  // ── card metadata (lib/card.js) consistency ──
  ok("card uses the canonical collection name", legendary.card.collection === "The Orchard Living Trees");
  ok("stage 4 card is 32-bit / 512x512", legendary.card.bit_depth === "32-bit" && legendary.card.resolution === "512x512", JSON.stringify({ b: legendary.card.bit_depth, r: legendary.card.resolution }));
  ok("clean base image finalized at 1024x1024", legendary.card.base_image_resolution === "1024x1024");

  // ── dashboard + JUICE ──
  ok("JUICE accrued for proven uptime", legendary.juice_accrued > 0, String(legendary.juice_accrued));
  const dash = await api(`/api/dashboard?wallet=xch1e2e`);
  ok("dashboard returns the owner's Tree", dash.trees.length === 1 && dash.trees[0].tree_id === mint.tree_id, JSON.stringify(dash.trees.map((t) => t.tree_id)));
  ok("dashboard shows claimable JUICE", dash.juice.claimable > 0, JSON.stringify(dash.juice));
  const claim = await api("/api/juice/claim", "POST", { wallet: "xch1e2e" });
  ok("JUICE claim succeeds", claim.ok && claim.claimed > 0, JSON.stringify(claim));
  ok("claimable resets to 0 after claiming", (await api(`/api/dashboard?wallet=xch1e2e`)).juice.claimable === 0);

  // ── unauthorized mint rejected ──
  const sim2 = await createSimDevice(base);
  await sim2.register(["gps"]);
  await (await sim2.heartbeat(1, ["gps"], {})).send();
  const noPass = await sim2.mint("NoPass Tree", "", "");
  ok("mint without an Orchard Pass is rejected", noPass.ok === false && noPass.why === "no-orchard-pass", JSON.stringify(noPass));

  // ── network overview ──
  const net = await api("/api/network");
  ok("network overview counts the mint", net.mints >= 1 && net.minted >= 1, JSON.stringify({ mints: net.mints, minted: net.minted }));
  ok("network overview logged the rejected attacks", net.fraud_flags >= 3, String(net.fraud_flags));
} catch (e) {
  fail++;
  console.log(`  FAIL exception :: ${e && e.stack ? e.stack : e}`);
} finally {
  server.close();
}

console.log(`\n${fail === 0 ? "✅" : "❌"} e2e: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
