// The Orchard — canonical device identity crypto.
//
// One source of truth for how a physical node proves who it is: an ECDSA P-256
// keypair, a device id derived from the PUBLIC KEY (never the MAC), and
// deterministic message signing/verification. Shared by the binding demo, the
// device simulator, and the Oracle so they can never disagree.
//
// Zero dependencies. Works in Node 18+ and the browser (WebCrypto).

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export const ID_PREFIX = "TREE-";

// deterministic, key-sorted serialization so signer and verifier hash the SAME bytes
export function stable(o) {
  if (Array.isArray(o)) return "[" + o.map(stable).join(",") + "]";
  if (o && typeof o === "object")
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stable(o[k])).join(",") + "}";
  return JSON.stringify(o);
}

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const unhex = (s) => Uint8Array.from(s.match(/../g).map((h) => parseInt(h, 16)));
export const randHex = (n = 16) => hex(globalThis.crypto.getRandomValues(new Uint8Array(n)));
export const sha256hex = async (s) => hex(await subtle.digest("SHA-256", enc.encode(s)));

// A device's identity is the hash of its public key. You cannot claim an id you
// did not derive — the Oracle recomputes this and rejects mismatches.
export async function deviceIdFromPub(pubHex) {
  return ID_PREFIX + (await sha256hex(pubHex)).slice(0, 24);
}

export async function verifySignature(pubHex, msg, sigHex) {
  try {
    const key = await subtle.importKey("raw", unhex(pubHex), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, unhex(sigHex), enc.encode(stable(msg)));
  } catch {
    return false;
  }
}

// Generate a fresh device (simulates first-boot keygen on the ESP32).
export async function generateDevice() {
  const kp = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pubHex = hex(await subtle.exportKey("raw", kp.publicKey)); // 65-byte uncompressed point
  const deviceId = await deviceIdFromPub(pubHex);
  return {
    pubHex,
    deviceId,
    async sign(msg) {
      return hex(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, enc.encode(stable(msg))));
    },
  };
}
