// ─────────────────────────────────────────────────────────────────────────────
// The Orchard — Oracle (testbed implementation)
//
// A zero-dependency Node HTTP server that runs the whole flow end to end:
//   wallet + Pass gate (mocked) → device registration (real P-256 signatures)
//   → signed heartbeats → sensor verification → growth (lib/growth.js)
//   → mint → card metadata (lib/card.js) → dashboard + JUICE rewards.
//
// It NEVER trusts an unsigned device message — registration/heartbeat/recover
// all verify ECDSA P-256 signatures via the canonical lib/identity.mjs.
//
// State is in-memory (resets on restart) — this is a testbed, not production.
//
// Run:  node oracle/server.mjs           (serves dashboard at http://localhost:8791)
// ─────────────────────────────────────────────────────────────────────────────

import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { deviceIdFromPub, verifySignature, randHex } from "../lib/identity.mjs";
import { buildRecipe } from "../lib/growth.js";
import { buildCardMetadata, buildCardDisplay, splitCardFields } from "../lib/card.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── tunables ─────────────────────────────────────────────────────────────────
const SEASON_DAYS = 30;                 // one "Season" of uptime
const VERIFY_THRESHOLD = { gps: 1, _default: 3 }; // heartbeats before a sensor is "verified"
const JUICE_PER_HEARTBEAT = 5;          // base JUICE for an eligible, healthy beat

// ── in-memory state ──────────────────────────────────────────────────────────
const nodes = new Map();        // deviceId -> node record
const treeIndex = new Map();    // tree_id  -> deviceId
const sessions = new Map();      // token -> wallet
const issuedNonces = new Set();
const seenNonces = new Set();
const fraud = [];               // { deviceId, kind, detail, at }
let mintCounter = 0;
let failedRegistrations = 0;

// ── helpers ──────────────────────────────────────────────────────────────────
const SPECIES = ["oak", "maple", "pine"];
const SHAPES = ["tall", "wide", "crooked"];
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// small deterministic hash → int (for DNA-driven species/shape)
function seedInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function pickFrom(seed, arr, salt) {
  return arr[(seedInt(seed + ":" + salt) % arr.length)];
}

function issueNonce() {
  const n = randHex(16);
  issuedNonces.add(n);
  return n;
}
function consumeNonce(n) {
  if (!issuedNonces.has(n)) return "unknown-nonce";
  if (seenNonces.has(n)) return "replayed-nonce";
  seenNonces.add(n);
  return "ok";
}
function flag(deviceId, kind, detail) {
  fraud.push({ deviceId, kind, detail, at: Date.now() });
}

// mock Pass ownership — any non-empty wallet "holds a Pass" in the testbed
function holdsPass(wallet) {
  return typeof wallet === "string" && wallet.length > 0;
}

function verifyThreshold(sensor) {
  return VERIFY_THRESHOLD[sensor] ?? VERIFY_THRESHOLD._default;
}

function statusLabel(node) {
  if (node.status === "registered") return "Registered";
  if (node.status === "dormant") return "Dormant";
  if (node.status === "withered") return "Withered";
  if (node.verifiedSensors.size > 0) return "Active";
  return "Verified";
}

// Derive the full live state of a node: growth recipe + NFT card + summary.
function computeState(node) {
  const verifiedSensors = [...node.verifiedSensors];
  const seasons = Math.floor(node.uptimeDays / SEASON_DAYS);
  const season = seasons % 4; // spring/summer/fall/winter cycle as it ages
  const state = {
    registered: true,
    gpsVerified: verifiedSensors.includes("gps"),
    firstHeartbeat: node.heartbeatCount >= 1,
    uptimeDays: node.uptimeDays,
    verifiedSensors,
    healthScore: node.health,
    consistentReporting: node.heartbeatCount >= 3,
    uptimeScore: node.uptimeScore,
    seasons,
    season,
    badges: node.badges,
  };
  const recipe = buildRecipe({
    dna_seed: String(node.dna_seed ?? node.deviceId),
    species: node.species,
    shape_variant: node.shape,
    state,
  });
  const reward_eligible = recipe.render_stage >= 2 && state.gpsVerified && node.health >= 50;
  const fruit_unlocked = (recipe.golden_roots ? ["golden_root"] : []).concat(recipe.fruit);

  const card = buildCardMetadata({
    tree_id: node.tree_id ?? node.deviceId,
    tree_name: node.tree_name ?? "Unnamed Tree",
    stage: recipe.render_stage,
    species: cap(node.species),
    growth_status: statusLabel(node),
    health_score: node.health,
    uptime_score: node.uptimeScore,
    sensors_verified: verifiedSensors,
    fruit_unlocked,
    firmware_version: node.firmware,
    region: node.region,
    reward_eligible,
    last_verified_epoch: node.lastSeen,
  });

  return {
    deviceId: node.deviceId,
    tree_id: node.tree_id ?? null,
    minted: !!node.tree_id,
    owner_wallet: node.owner_wallet ?? null,
    dna_seed: node.dna_seed ?? null,
    species: node.species,
    shape: node.shape,
    status: node.status,
    growth_status: statusLabel(node),
    uptimeDays: node.uptimeDays,
    seasons,
    season,
    heartbeatCount: node.heartbeatCount,
    declared_sensors: [...node.declaredSensors],
    verified_sensors: verifiedSensors,
    reward_eligible,
    juice_accrued: Math.round(node.juiceAccrued * 100) / 100,
    juice_claimed: Math.round(node.juiceClaimed * 100) / 100,
    recipe,
    card,
    card_display: buildCardDisplay(card),
    card_split: splitCardFields(card),
  };
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolveBody) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolveBody(data ? JSON.parse(data) : {});
      } catch {
        resolveBody(null); // signal parse error
      }
    });
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
async function serveStatic(res, absPath) {
  if (!existsSync(absPath)) return send(res, 404, { error: "not found" });
  const body = await readFile(absPath);
  res.writeHead(200, { "Content-Type": MIME[extname(absPath)] || "application/octet-stream", "Access-Control-Allow-Origin": "*" });
  res.end(body);
}

// ── request handler ──────────────────────────────────────────────────────────
async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") return send(res, 204, {});

  // ---- static: the dashboard + the shared lib modules ----
  if (method === "GET" && !path.startsWith("/api/")) {
    if (path.startsWith("/lib/")) {
      const abs = normalize(resolve(ROOT, "." + path));
      if (!abs.startsWith(resolve(ROOT, "lib"))) return send(res, 403, { error: "forbidden" });
      return serveStatic(res, abs);
    }
    const rel = path === "/" ? "/index.html" : path;
    const abs = normalize(resolve(ROOT, "web/dashboard" + rel));
    if (!abs.startsWith(resolve(ROOT, "web/dashboard"))) return send(res, 403, { error: "forbidden" });
    return serveStatic(res, abs);
  }

  // ---- API ----
  try {
    // wallet auth (mock Pass gate)
    if (method === "POST" && path === "/api/auth/challenge") {
      const b = await readBody(req);
      if (!b?.address) return send(res, 400, { error: "address required" });
      return send(res, 200, { nonce: issueNonce(), address: b.address });
    }
    if (method === "POST" && path === "/api/auth/verify") {
      const b = await readBody(req);
      if (!b?.address) return send(res, 400, { error: "address required" });
      // (testbed) we accept the wallet and mock the on-chain Pass lookup
      const token = randHex(16);
      sessions.set(token, b.address);
      return send(res, 200, { session: token, address: b.address, holdsPass: holdsPass(b.address) });
    }

    // device: get a single-use nonce
    if (method === "GET" && path === "/api/device/nonce") {
      return send(res, 200, { nonce: issueNonce() });
    }

    // device: register
    if (method === "POST" && path === "/api/device/register") {
      const m = await readBody(req);
      if (!m) return send(res, 400, { error: "bad json" });
      const { sig, ...msg } = m;
      const fail = (why) => { failedRegistrations++; flag(msg.deviceId, "register-rejected", why); return send(res, 400, { ok: false, why }); };
      if (msg.type !== "register" || !msg.deviceId || !msg.pubHex) return fail("bad-message");
      if (msg.deviceId !== (await deviceIdFromPub(msg.pubHex))) return fail("id-not-derived-from-pubkey");
      const nstate = consumeNonce(msg.nonce); if (nstate !== "ok") return fail(nstate);
      if (!(await verifySignature(msg.pubHex, msg, sig))) return fail("bad-signature");
      if (nodes.has(msg.deviceId)) return fail("already-registered"); // one Tree per device key
      const dna_seed = seedInt(msg.deviceId);
      nodes.set(msg.deviceId, {
        deviceId: msg.deviceId,
        pubHex: msg.pubHex,
        firmware: msg.firmware || "orchard-fw-0.1.0",
        region: msg.region || "US-KY",
        registered_geohash: msg.geohash || null,
        declaredSensors: new Set(msg.sensors || []),
        verifiedSensors: new Set(),
        sensorCounts: {},
        lastSeq: 0,
        heartbeatCount: 0,
        uptimeDays: 0,
        uptimeScore: 100,
        health: 0,
        seasons: 0,
        season: 0,
        badges: [],
        status: "registered",
        firstSeen: Date.now(),
        lastSeen: 0,
        juiceAccrued: 0,
        juiceClaimed: 0,
        dna_seed,
        species: pickFrom(msg.deviceId, SPECIES, "species"),
        shape: pickFrom(msg.deviceId, SHAPES, "shape"),
        tree_id: null,
        tree_name: null,
        owner_wallet: null,
      });
      return send(res, 200, { ok: true, deviceId: msg.deviceId, status: "registered", state: computeState(nodes.get(msg.deviceId)) });
    }

    // device: signed heartbeat
    if (method === "POST" && path === "/api/device/heartbeat") {
      const m = await readBody(req);
      if (!m) return send(res, 400, { error: "bad json" });
      const { sig, ...msg } = m;
      const node = nodes.get(msg.deviceId);
      if (!node) return send(res, 404, { ok: false, why: "unknown-device" });
      const reject = (why) => { flag(msg.deviceId, "heartbeat-rejected", why); return send(res, 400, { ok: false, why }); };
      const nstate = consumeNonce(msg.nonce); if (nstate !== "ok") return reject(nstate);
      if (typeof msg.seq !== "number" || msg.seq <= node.lastSeq) return reject("stale-seq");
      if (!(await verifySignature(node.pubHex, msg, sig))) return reject("bad-signature");

      // accept
      node.lastSeq = msg.seq;
      node.heartbeatCount++;
      node.lastSeen = Date.now();
      node.uptimeDays = Math.max(node.uptimeDays, Number(msg.uptimeDays) || node.uptimeDays);
      node.health = Math.max(0, Math.min(100, Number(msg.health ?? node.health)));
      if (typeof msg.uptimeScore === "number") node.uptimeScore = Math.max(0, Math.min(100, msg.uptimeScore));
      node.status = "active";

      // sensor verification: count reports, promote to verified at threshold
      for (const s of msg.sensors || []) {
        node.sensorCounts[s] = (node.sensorCounts[s] || 0) + 1;
        if (node.sensorCounts[s] >= verifyThreshold(s)) node.verifiedSensors.add(s);
      }

      const state = computeState(node);
      if (state.reward_eligible) node.juiceAccrued += JUICE_PER_HEARTBEAT * (node.health / 100);

      return send(res, 200, { ok: true, state: computeState(node) });
    }

    // tree: mint (requires Pass)
    if (method === "POST" && path === "/api/tree/mint") {
      const b = await readBody(req);
      if (!b) return send(res, 400, { error: "bad json" });
      const node = nodes.get(b.deviceId);
      if (!node) return send(res, 404, { ok: false, why: "unknown-device" });
      if (node.tree_id) return send(res, 409, { ok: false, why: "already-minted", tree_id: node.tree_id });
      if (!holdsPass(b.ownerWallet)) return send(res, 403, { ok: false, why: "no-orchard-pass" });
      if (node.heartbeatCount < 1) return send(res, 400, { ok: false, why: "device-not-verified-yet" });
      mintCounter++;
      node.tree_id = "TREE-" + String(mintCounter).padStart(6, "0");
      node.tree_name = (b.treeName || "Unnamed Tree").slice(0, 60);
      node.description = (b.description || "").slice(0, 280);
      node.owner_wallet = b.ownerWallet;
      treeIndex.set(node.tree_id, node.deviceId);
      return send(res, 200, { ok: true, tree_id: node.tree_id, state: computeState(node) });
    }

    // tree: rename (owner-updatable field)
    if (method === "POST" && /^\/api\/tree\/[^/]+\/name$/.test(path)) {
      const tree_id = decodeURIComponent(path.split("/")[3]);
      const b = await readBody(req);
      const deviceId = treeIndex.get(tree_id);
      const node = deviceId && nodes.get(deviceId);
      if (!node) return send(res, 404, { ok: false, why: "unknown-tree" });
      if (b.ownerWallet && b.ownerWallet !== node.owner_wallet) return send(res, 403, { ok: false, why: "not-owner" });
      if (typeof b.name === "string") node.tree_name = b.name.slice(0, 60);
      if (typeof b.description === "string") node.description = b.description.slice(0, 280);
      return send(res, 200, { ok: true, state: computeState(node) });
    }

    // tree: get by tree_id or deviceId
    if (method === "GET" && /^\/api\/tree\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split("/")[3]);
      const deviceId = treeIndex.get(id) || (nodes.has(id) ? id : null);
      const node = deviceId && nodes.get(deviceId);
      if (!node) return send(res, 404, { error: "not found" });
      return send(res, 200, computeState(node));
    }

    // dashboard: a wallet's orchard
    if (method === "GET" && path === "/api/dashboard") {
      const wallet = url.searchParams.get("wallet") || "";
      const trees = [];
      let accrued = 0, claimed = 0;
      for (const node of nodes.values()) {
        if (node.owner_wallet !== wallet) continue;
        trees.push(computeState(node));
        accrued += node.juiceAccrued;
        claimed += node.juiceClaimed;
      }
      return send(res, 200, {
        wallet,
        trees,
        juice: { accrued: Math.round(accrued * 100) / 100, claimed: Math.round(claimed * 100) / 100, claimable: Math.round((accrued - claimed) * 100) / 100 },
      });
    }

    // admin: network overview
    if (method === "GET" && path === "/api/network") {
      const byStatus = {}, byStage = {}, regions = {};
      let totalVerifiedSensors = 0, juiceLiability = 0, minted = 0;
      for (const node of nodes.values()) {
        const st = computeState(node);
        byStatus[node.status] = (byStatus[node.status] || 0) + 1;
        byStage[st.recipe.growth_stage] = (byStage[st.recipe.growth_stage] || 0) + 1;
        regions[node.region] = (regions[node.region] || 0) + 1;
        totalVerifiedSensors += st.verified_sensors.length;
        juiceLiability += node.juiceAccrued - node.juiceClaimed;
        if (node.tree_id) minted++;
      }
      return send(res, 200, {
        total_nodes: nodes.size,
        minted,
        by_status: byStatus,
        by_stage: byStage,
        regions,
        total_verified_sensors: totalVerifiedSensors,
        juice_liability: Math.round(juiceLiability * 100) / 100,
        mints: mintCounter,
        failed_registrations: failedRegistrations,
        fraud_flags: fraud.length,
        recent_fraud: fraud.slice(-8).reverse(),
      });
    }

    // juice: claim (mock CAT payout)
    if (method === "POST" && path === "/api/juice/claim") {
      const b = await readBody(req);
      const wallet = b?.wallet || "";
      let delta = 0;
      for (const node of nodes.values()) {
        if (node.owner_wallet !== wallet) continue;
        const c = node.juiceAccrued - node.juiceClaimed;
        if (c > 0) { delta += c; node.juiceClaimed = node.juiceAccrued; }
      }
      return send(res, 200, { ok: true, wallet, claimed: Math.round(delta * 100) / 100, tx: "mock-cat-" + randHex(6) });
    }

    return send(res, 404, { error: "no such route", path });
  } catch (err) {
    return send(res, 500, { error: "server error", detail: String(err && err.message) });
  }
}

export function createServer() {
  return createHttpServer((req, res) => { handle(req, res).catch((e) => send(res, 500, { error: String(e) })); });
}

// CLI: start listening when run directly
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 8791;
  createServer().listen(port, () => {
    console.log(`🔮 Orchard Oracle (testbed) listening on http://localhost:${port}`);
    console.log(`   dashboard → http://localhost:${port}/`);
    console.log(`   drive it  → node oracle/sim-device.mjs --url http://localhost:${port}`);
  });
}
