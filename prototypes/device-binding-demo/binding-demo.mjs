// ─────────────────────────────────────────────────────────────────────────────
// The Orchard — device ⇄ Tree binding demo
//
// Proves the identity model end-to-end with ZERO dependencies (Node 18+ WebCrypto):
//   1. A device generates an ECDSA P-256 keypair; its identity is the hash of its
//      public key (NOT its MAC).
//   2. The device registers by signing an Oracle-issued nonce.
//   3. Each heartbeat is signed over a fresh nonce (anti-replay) with a monotonic seq.
//   4. The Oracle rejects replays, forgeries, and impostors.
//   5. A reflashed device can only recover its identity by proving possession of the
//      OLD private key.
//
// Crypto lives in the shared canonical module: lib/identity.mjs
//
// Run:  node binding-demo.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { generateDevice, deviceIdFromPub, verifySignature, randHex } from "../../lib/identity.mjs";

let pass = 0, fail = 0;
const check = (label, ok) => { (ok ? pass++ : fail++); console.log(`   ${ok ? "✓" : "✗ FAIL"}  ${label}`); };

// ── a simulated Tree device (keypair from the shared module + a heartbeat counter)
async function makeDevice(label) {
  const d = await generateDevice();
  let seq = 0;
  return { label, ...d, nextSeq() { return ++seq; } };
}

// ── the Oracle (in-memory) ───────────────────────────────────────────────────
function makeOracle() {
  const registry = new Map();        // deviceId -> { pubHex, lastSeq }
  const seenNonces = new Set();      // single-use challenge nonces
  const issued = new Set();          // nonces we actually handed out

  const issueNonce = () => { const n = randHex(16); issued.add(n); return n; };
  function consumeNonce(n) {
    if (!issued.has(n)) return "unknown-nonce";
    if (seenNonces.has(n)) return "replayed-nonce";
    seenNonces.add(n);
    return "ok";
  }

  return {
    issueNonce,
    async register(msg, sigHex) {
      if (msg.type !== "register") return { ok: false, why: "bad-type" };
      const expectedId = await deviceIdFromPub(msg.pubHex);
      if (msg.deviceId !== expectedId) return { ok: false, why: "id-not-derived-from-pubkey" };
      const n = consumeNonce(msg.nonce); if (n !== "ok") return { ok: false, why: n };
      if (!(await verifySignature(msg.pubHex, msg, sigHex))) return { ok: false, why: "bad-signature" };
      if (registry.has(msg.deviceId)) return { ok: false, why: "already-registered" }; // one Tree per key
      registry.set(msg.deviceId, { pubHex: msg.pubHex, lastSeq: 0 });
      return { ok: true };
    },
    async heartbeat(msg, sigHex) {
      const rec = registry.get(msg.deviceId);
      if (!rec) return { ok: false, why: "unknown-device" };
      const n = consumeNonce(msg.nonce); if (n !== "ok") return { ok: false, why: n };
      if (msg.seq <= rec.lastSeq) return { ok: false, why: "stale-seq" };
      if (!(await verifySignature(rec.pubHex, msg, sigHex))) return { ok: false, why: "bad-signature" };
      rec.lastSeq = msg.seq;
      return { ok: true };
    },
    async recover(msg, sigHexOldKey) {
      const rec = registry.get(msg.deviceId);
      if (!rec) return { ok: false, why: "unknown-device" };
      const n = consumeNonce(msg.nonce); if (n !== "ok") return { ok: false, why: n };
      if (!(await verifySignature(rec.pubHex, msg, sigHexOldKey))) return { ok: false, why: "old-key-proof-failed" };
      rec.pubHex = msg.newPubHex; rec.lastSeq = 0; // rebind to the new key
      return { ok: true };
    },
  };
}

// ── scenario ─────────────────────────────────────────────────────────────────
console.log("\n🌳  The Orchard — device ⇄ Tree binding demo\n");
const oracle = makeOracle();
const device = await makeDevice("Rick's backyard node");

console.log("1) Registration");
console.log(`   device id : ${device.deviceId}`);
console.log(`   public key: ${device.pubHex.slice(0, 32)}… (P-256, 65 bytes)`);
{
  const nonce = oracle.issueNonce();
  const msg = { type: "register", deviceId: device.deviceId, pubHex: device.pubHex, nonce,
                firmware: "orchard-fw-0.1.0", sensors: ["temperature", "humidity", "gps"], geohash: "dn4w" };
  const r = await oracle.register(msg, await device.sign(msg));
  check("device registers with a valid signed nonce", r.ok);
}

console.log("\n2) Signed heartbeats (anti-replay + monotonic seq)");
let lastHeartbeat = null;
for (let i = 0; i < 3; i++) {
  const nonce = oracle.issueNonce();
  const msg = { type: "heartbeat", deviceId: device.deviceId, seq: device.nextSeq(), nonce,
                uptimeDays: 7 + i, health: 96 };
  const sig = await device.sign(msg);
  const r = await oracle.heartbeat(msg, sig);
  check(`heartbeat seq=${msg.seq} accepted`, r.ok);
  lastHeartbeat = { msg, sig };
}

console.log("\n3) Attacks the Oracle MUST reject");
{
  const r = await oracle.heartbeat(lastHeartbeat.msg, lastHeartbeat.sig); // replay verbatim
  check("replayed heartbeat rejected (used nonce)", !r.ok && r.why === "replayed-nonce");
}
{
  const nonce = oracle.issueNonce();
  const good = { type: "heartbeat", deviceId: device.deviceId, seq: device.nextSeq(), nonce, uptimeDays: 9, health: 96 };
  const sig = await device.sign(good);
  const forged = { ...good, health: 5 }; // tamper payload, keep signature
  const r = await oracle.heartbeat(forged, sig);
  check("forged payload rejected (signature mismatch)", !r.ok && r.why === "bad-signature");
}
{
  const impostor = await makeDevice("impostor");
  const nonce = oracle.issueNonce();
  const msg = { type: "heartbeat", deviceId: device.deviceId, seq: 999, nonce, uptimeDays: 1, health: 100 };
  const r = await oracle.heartbeat(msg, await impostor.sign(msg));
  check("impostor signing for another id rejected", !r.ok && r.why === "bad-signature");
}
{
  const nonce = oracle.issueNonce();
  const msg = { type: "register", deviceId: device.deviceId, pubHex: device.pubHex, nonce,
                firmware: "x", sensors: [], geohash: "dn4w" };
  const r = await oracle.register(msg, await device.sign(msg));
  check("second mint of the same device rejected (one Tree per key)", !r.ok && r.why === "already-registered");
}

console.log("\n4) Reflash recovery (prove possession of the OLD key)");
const reflashed = await makeDevice("Rick's node, reflashed");
{
  const nonce = oracle.issueNonce();
  const msg = { type: "recover", deviceId: device.deviceId, newPubHex: reflashed.pubHex, nonce };
  const r = await oracle.recover(msg, await device.sign(msg)); // signed by the ORIGINAL key
  check("recovery accepted when old key proves possession", r.ok);
}
{
  const thief = await makeDevice("thief");
  const nonce = oracle.issueNonce();
  const msg = { type: "recover", deviceId: device.deviceId, newPubHex: thief.pubHex, nonce };
  const r = await oracle.recover(msg, await thief.sign(msg)); // signed by the WRONG key
  check("identity theft without the old key rejected → contested", !r.ok && r.why === "old-key-proof-failed");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
