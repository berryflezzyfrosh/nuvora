// ============================================================
// E2EE — Client-side End-to-End Encryption
// ------------------------------------------------------------
// Uses the Web Crypto API (SubtleCrypto) for ECDH key exchange
// and AES-GCM encryption. The server (Supabase) only ever sees
// encrypted ciphertext — it never has access to plaintext messages
// or the symmetric keys used to encrypt them.
//
// Flow:
// 1. On signup, generate an ECDH key pair. Store private key in
//    localStorage (encrypted with a PIN-derived key), publish
//    public key to the profiles table.
// 2. To send a message to a user, fetch their public key, perform
//    ECDH to derive a shared secret, use it as the AES-GCM key.
// 3. Encrypt the message, store ciphertext + IV in Supabase.
// 4. Recipient fetches the message, uses their private key + the
//    sender's public key to derive the same shared secret, decrypts.
// ============================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------- Base64 helpers ----------
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ---------- Key generation ----------
export async function generateKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
  const pub = await crypto.subtle.exportKey("raw", pair.publicKey);
  const priv = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return {
    publicKey: bufToB64(pub),
    privateKey: bufToB64(priv),
  };
}

export async function importPublicKey(b64) {
  return crypto.subtle.importKey(
    "raw",
    b64ToBuf(b64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
}

export async function importPrivateKey(b64) {
  return crypto.subtle.importKey(
    "pkcs8",
    b64ToBuf(b64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"]
  );
}

// ---------- Shared secret derivation ----------
async function deriveSharedKey(privateKey, publicKey) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ---------- Encrypt / Decrypt ----------
export async function encryptMessage(plaintext, privateKeyB64, peerPublicKeyB64) {
  const priv = await importPrivateKey(privateKeyB64);
  const pub = await importPublicKey(peerPublicKeyB64);
  const key = await deriveSharedKey(priv, pub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  return { ciphertext: bufToB64(ciphertext), iv: bufToB64(iv.buffer) };
}

export async function decryptMessage(ciphertextB64, ivB64, privateKeyB64, peerPublicKeyB64) {
  try {
    const priv = await importPrivateKey(privateKeyB64);
    const pub = await importPublicKey(peerPublicKeyB64);
    const key = await deriveSharedKey(priv, pub);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(ivB64)) },
      key,
      b64ToBuf(ciphertextB64)
    );
    return dec.decode(plaintext);
  } catch (e) {
    return "[Unable to decrypt message]";
  }
}

// ---------- PIN-based local key protection ----------
export async function derivePinKey(pin) {
  const encKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("nuvora-salt"), iterations: 100000, hash: "SHA-256" },
    encKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptForStorage(plaintext, pin) {
  const key = await derivePinKey(pin);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { data: bufToB64(ct), iv: bufToB64(iv.buffer) };
}

export async function decryptFromStorage(dataB64, ivB64, pin) {
  try {
    const key = await derivePinKey(pin);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(ivB64)) },
      key,
      b64ToBuf(dataB64)
    );
    return dec.decode(pt);
  } catch {
    return null;
  }
}

// ---------- Storage helpers ----------
const PRIV_KEY_STORAGE = "wa_private_key";

export function storePrivateKey(privateKeyB64, pin) {
  // For simplicity, store encrypted with PIN. If no PIN, store raw (less secure but functional).
  if (pin) {
    encryptForStorage(privateKeyB64, pin).then(({ data, iv }) => {
      localStorage.setItem(PRIV_KEY_STORAGE, JSON.stringify({ data, iv, pinned: true }));
    });
  } else {
    localStorage.setItem(PRIV_KEY_STORAGE, JSON.stringify({ data: privateKeyB64, pinned: false }));
  }
}

export async function loadPrivateKey(pin) {
  const raw = localStorage.getItem(PRIV_KEY_STORAGE);
  if (!raw) return null;
  const obj = JSON.parse(raw);
  if (obj.pinned) {
    if (!pin) return null;
    return await decryptFromStorage(obj.data, obj.iv, pin);
  }
  return obj.data;
}

export function clearPrivateKey() {
  localStorage.removeItem(PRIV_KEY_STORAGE);
}
