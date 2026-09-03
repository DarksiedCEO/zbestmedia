// P1A-01 attestation verification CORE (V4 remediation of Codex F1/F2/F3).
//
// This module is the INJECTABLE verification primitive. It takes the anchor,
// the replay store, and the clock as explicit arguments so it can be exercised
// with an ephemeral key in tests. Production code (validate-p1a-authority-root)
// wraps this behind a SEALED resolver that accepts NONE of these from a caller.
// Importing this module directly gives you the raw primitive — it can never, by
// itself, emit an authority verdict (OBSERVED_EXECUTION, CUSTODY_SIGNATURE_VERIFIED,
// GATES_COMPLETE, ROLLBACK_AUTHORIZED); only the sealed production entrypoints do.
import { createHash, verify as cryptoVerify, createPublicKey } from "node:crypto";
import { openSync, closeSync, constants } from "node:fs";
import { join } from "node:path";

const HEX40 = /^[0-9a-f]{40}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const HEX_ID = /^[0-9a-f]{32,64}$/u;
// Ed25519 signature = 64 bytes => canonical base64 is exactly 86 chars + "==".
const CANONICAL_B64_64 = /^[A-Za-z0-9+/]{86}==$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

export const CANONICAL_REPOSITORY = "https://github.com/DarksiedCEO/zbestmedia.git";
export const CANONICAL_PRODUCERS = Object.freeze(["GITHUB_ACTIONS_PROTECTED_RUN", "FOUNDER_DARKSIEDCEO", "CODEX"]);
// The strict signed field set (signature excluded). Order is fixed by canonical
// serialization (sorted keys); any extra or missing field is rejected.
export const SIGNED_FIELDS = Object.freeze(["attestationId", "claimType", "commit", "expiresAt", "issuedAt", "keyId", "producer", "repository", "scope"]);
export const ATTESTATION_FIELDS = Object.freeze([...SIGNED_FIELDS, "signature"]);
export const DEFAULT_MAX_WINDOW_MS = 15 * 60 * 1000; // attestation validity window ceiling
export const DEFAULT_SKEW_MS = 60 * 1000;            // clock-skew tolerance

const sha256hex = (b) => createHash("sha256").update(b).digest("hex");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}

// The exact canonical signed bytes. Deterministic, sorted, strict field set.
export function canonicalAttestationMessage(att) {
  const picked = {};
  for (const f of SIGNED_FIELDS) picked[f] = att?.[f];
  return Buffer.from(JSON.stringify(canonical(picked)), "utf8");
}

// V5 remediation (Codex INDEPENDENT_REVIEW_BLOCK, LOW): exactly one canonical
// byte representation of the signed envelope. The envelope is a FLAT object of
// exactly ATTESTATION_FIELDS, every value a string (no numbers, no nesting). Its
// canonical serialization is JSON with keys in a fixed sorted order and no
// insignificant whitespace. Requiring the received bytes to EQUAL this canonical
// serialization is a single structural boundary — not literal-text/regex
// scanning — that rejects: duplicate member names (escaped OR literal: JSON.parse
// collapses them, so any duplicate makes raw ≠ canonical), key reordering,
// insignificant whitespace, alternate escape spellings (they decode then
// re-serialize to canonical, ≠ raw), BOMs and non-ASCII (canonical is ASCII),
// leading/trailing whitespace, trailing tokens, and concatenated documents.
export const CANONICAL_ENVELOPE_FIELD_ORDER = Object.freeze([...ATTESTATION_FIELDS].sort());

export function canonicalEnvelopeText(att) {
  const ordered = {};
  for (const f of CANONICAL_ENVELOPE_FIELD_ORDER) ordered[f] = att[f];
  return JSON.stringify(ordered);
}

export function isCanonicalEd25519Signature(sig) {
  if (typeof sig !== "string" || !CANONICAL_B64_64.test(sig)) return false;
  const buf = Buffer.from(sig, "base64");
  return buf.length === 64 && buf.toString("base64") === sig;
}

function parseInstantMs(s) {
  if (typeof s !== "string" || !ISO_INSTANT.test(s)) return NaN;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : NaN;
}

// A filesystem-backed, atomic, single-consumption replay ledger. consume() uses
// O_CREAT|O_EXCL so concurrent duplicate consumption cannot both succeed. If the
// ledger directory is absent/unwritable the store is NOT authoritative and every
// consume fails closed.
export function makeFsReplayStore(dir) {
  return {
    consume(key) {
      let fd;
      try {
        fd = openSync(join(dir, `${sha256hex(Buffer.from(key, "utf8"))}.used`), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      } catch (err) {
        if (err && err.code === "EEXIST") return { ok: false, reason: "REPLAY_DETECTED" };
        return { ok: false, reason: "MISSING_REPLAY_STORE" };
      }
      closeSync(fd);
      return { ok: true };
    },
  };
}

// The one verification core. `expected` = { claimType, scope, subject }.
// `anchor` = { status, publicKeyPem, keyId } | null. `opts` = { nowMs, replayStore, maxWindowMs, skewMs }.
export function verifyAttestationCore(rawText, expected, anchor, opts) {
  if (typeof rawText !== "string" || rawText.length === 0) return { verified: false, reason: "ATTESTATION_EMPTY" };
  let att;
  try { att = JSON.parse(rawText); } catch { return { verified: false, reason: "ATTESTATION_MALFORMED" }; }
  if (!att || typeof att !== "object" || Array.isArray(att)) return { verified: false, reason: "ATTESTATION_NOT_OBJECT" };

  // Strict field set: exactly ATTESTATION_FIELDS, no missing, no extras.
  const keys = Object.keys(att);
  if (keys.length !== ATTESTATION_FIELDS.length || !ATTESTATION_FIELDS.every((f) => Object.prototype.hasOwnProperty.call(att, f))) {
    return { verified: false, reason: "ATTESTATION_FIELD_SET_INVALID" };
  }
  // Every envelope value is a string; no numbers/nesting are permitted, so no
  // number-format or nested-structure variants can exist.
  if (!ATTESTATION_FIELDS.every((f) => typeof att[f] === "string")) return { verified: false, reason: "ENVELOPE_VALUE_NOT_STRING" };
  // Exactly one canonical byte representation. This subsumes duplicate keys
  // (escaped or literal), reordering, whitespace, alternate escapes, BOM,
  // trailing bytes/tokens, and non-ASCII — before any trust-state evaluation.
  if (rawText !== canonicalEnvelopeText(att)) return { verified: false, reason: "DOCUMENT_NOT_CANONICAL" };

  // Types / lengths / character sets.
  if (!HEX_ID.test(att.attestationId ?? "")) return { verified: false, reason: "ATTESTATION_ID_INVALID" };
  if (typeof att.keyId !== "string" || att.keyId.length === 0 || att.keyId.length > 128) return { verified: false, reason: "KEY_ID_INVALID" };
  if (!CANONICAL_PRODUCERS.includes(att.producer)) return { verified: false, reason: "PRODUCER_UNKNOWN" };
  if (att.repository !== CANONICAL_REPOSITORY) return { verified: false, reason: "REPOSITORY_BINDING_INVALID" };
  if (!HEX40.test(att.commit ?? "") && !HEX64.test(att.commit ?? "")) return { verified: false, reason: "COMMIT_BINDING_INVALID" };
  if (typeof att.claimType !== "string" || typeof att.scope !== "string") return { verified: false, reason: "CLAIM_OR_SCOPE_INVALID" };

  // Canonical Ed25519 signature encoding: strict base64 alphabet + length,
  // exact 64-byte decode, and encode-back equality (rejects whitespace, junk
  // suffix, non-canonical padding bits). One guard, one primitive.
  if (!isCanonicalEd25519Signature(att.signature)) return { verified: false, reason: "SIGNATURE_ENCODING_NON_CANONICAL" };
  const sigBuf = Buffer.from(att.signature, "base64");

  // Expected-subject and claim bindings.
  if (att.claimType !== expected?.claimType) return { verified: false, reason: "CLAIM_TYPE_MISMATCH" };
  if (att.scope !== expected?.scope) return { verified: false, reason: "SCOPE_MISMATCH" };
  if (att.commit !== expected?.subject) return { verified: false, reason: "SUBJECT_MISMATCH" };

  // Anchor custody: must be provisioned with a matching key id. UNPROVISIONED or
  // key-id mismatch fails closed even if a public key is present.
  if (!anchor || anchor.status !== "PROVISIONED" || anchor.publicKeyPem == null) return { verified: false, reason: "EXTERNAL_AUTHORITY_UNPROVISIONED" };
  if (anchor.keyId !== att.keyId) return { verified: false, reason: "KEY_ID_NOT_TRUSTED" };

  // Freshness: not-before, not-after, bounded window, explicit skew.
  const nowMs = opts?.nowMs;
  if (!Number.isFinite(nowMs)) return { verified: false, reason: "CLOCK_UNAVAILABLE" };
  const issued = parseInstantMs(att.issuedAt);
  const expires = parseInstantMs(att.expiresAt);
  if (Number.isNaN(issued) || Number.isNaN(expires)) return { verified: false, reason: "TIMESTAMP_INVALID" };
  const skew = opts?.skewMs ?? DEFAULT_SKEW_MS;
  const maxWindow = opts?.maxWindowMs ?? DEFAULT_MAX_WINDOW_MS;
  if (expires <= issued) return { verified: false, reason: "EXPIRY_NOT_AFTER_ISSUED" };
  if (expires - issued > maxWindow) return { verified: false, reason: "VALIDITY_WINDOW_TOO_LARGE" };
  if (nowMs < issued - skew) return { verified: false, reason: "ATTESTATION_NOT_YET_VALID" };
  if (nowMs > expires + skew) return { verified: false, reason: "ATTESTATION_EXPIRED" };

  // Signature over the exact canonical bytes.
  let key;
  try { key = createPublicKey(anchor.publicKeyPem); } catch { return { verified: false, reason: "TRUST_ANCHOR_KEY_INVALID" }; }
  let ok = false;
  try { ok = cryptoVerify(null, canonicalAttestationMessage(att), key, sigBuf); } catch { ok = false; }
  if (!ok) return { verified: false, reason: "SIGNATURE_INVALID" };

  // One-time consumption: authoritative, atomic, fail-closed if store missing.
  const store = opts?.replayStore;
  if (!store || typeof store.consume !== "function") return { verified: false, reason: "MISSING_REPLAY_STORE" };
  const consumed = store.consume(`${att.attestationId}|${att.claimType}|${att.scope}|${att.commit}|${att.keyId}`);
  if (!consumed.ok) return { verified: false, reason: consumed.reason };

  return { verified: true, reason: null };
}
