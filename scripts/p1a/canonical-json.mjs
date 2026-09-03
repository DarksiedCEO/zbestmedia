import { createHash } from "node:crypto";

export class ContractError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = "ContractError"; this.code = code; this.details = Object.freeze({ ...details }); }
}
const fail = (code, message, details) => { throw new ContractError(code, message, details); };
function validateString(value, field = "string") {
  if (value !== value.normalize("NFC")) fail("UNICODE_NOT_NFC", `${field} is not NFC`);
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index); let point = unit;
    if (unit >= 0xd800 && unit <= 0xdbff) { const low = value.charCodeAt(index + 1); if (!(low >= 0xdc00 && low <= 0xdfff)) fail("UNICODE_FORBIDDEN", `${field} contains a lone surrogate`); point = value.codePointAt(index); index += 1; }
    else if (unit >= 0xdc00 && unit <= 0xdfff) fail("UNICODE_FORBIDDEN", `${field} contains a lone surrogate`);
    if ((point >= 0xfdd0 && point <= 0xfdef) || (point & 0xffff) === 0xfffe || (point & 0xffff) === 0xffff) fail("UNICODE_FORBIDDEN", `${field} contains a noncharacter`);
  }
  return value;
}

class Parser {
  constructor(text) { this.text = text; this.at = 0; }
  ws() { while ([" ", "\t", "\n", "\r"].includes(this.text[this.at] ?? "")) this.at += 1; }
  value() {
    this.ws(); const char = this.text[this.at];
    if (char === "{") return this.object(); if (char === "[") return this.array(); if (char === '"') return this.string();
    for (const [token, value] of [["true", true], ["false", false], ["null", null]]) if (this.text.startsWith(token, this.at)) { this.at += token.length; return value; }
    const match = this.text.slice(this.at).match(/^-?(?:0|[1-9]\d*)/u);
    if (!match) fail("JSON_MALFORMED", `unexpected token at ${this.at}`);
    this.at += match[0].length;
    if (/[.eE]/u.test(this.text[this.at] ?? "")) fail("NUMBER_NON_INTEGER", "only safe integers are permitted");
    const number = Number(match[0]); if (!Number.isSafeInteger(number)) fail("NUMBER_UNSAFE", "integer exceeds safe range"); return number;
  }
  object() {
    const result = {}; const keys = new Set(); this.at += 1; this.ws(); if (this.text[this.at] === "}") { this.at += 1; return result; }
    while (true) {
      if (this.text[this.at] !== '"') fail("JSON_MALFORMED", "object key must be a string"); const key = this.string();
      if (keys.has(key)) fail("JSON_DUPLICATE_KEY", `duplicate key ${key}`); keys.add(key); this.ws();
      if (this.text[this.at++] !== ":") fail("JSON_MALFORMED", "missing colon"); result[key] = this.value(); this.ws();
      const next = this.text[this.at++]; if (next === "}") return result; if (next !== ",") fail("JSON_MALFORMED", "missing comma"); this.ws();
    }
  }
  array() { const result = []; this.at += 1; this.ws(); if (this.text[this.at] === "]") { this.at += 1; return result; } while (true) { result.push(this.value()); this.ws(); const next = this.text[this.at++]; if (next === "]") return result; if (next !== ",") fail("JSON_MALFORMED", "missing comma"); this.ws(); } }
  string() {
    const start = this.at; this.at += 1; let escaped = false;
    while (this.at < this.text.length) { const char = this.text[this.at++]; if (!escaped && char === '"') { let value; try { value = JSON.parse(this.text.slice(start, this.at)); } catch { fail("JSON_MALFORMED", "invalid string escape"); } return validateString(value); } if (!escaped && char.charCodeAt(0) < 0x20) fail("JSON_MALFORMED", "unescaped control character"); escaped = !escaped && char === "\\"; if (char !== "\\") escaped = false; }
    fail("JSON_MALFORMED", "unterminated string");
  }
}

export function parseStrictJson(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) fail("UTF8_BOM_FORBIDDEN", "BOM is forbidden");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); const parser = new Parser(text); const value = parser.value(); parser.ws(); if (parser.at !== text.length) fail("JSON_TRAILING_DATA", "trailing data"); return value;
}
export function canonicalize(value) {
  if (value === null) return "null"; if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") { if (!Number.isSafeInteger(value)) fail("NUMBER_INVALID", "only safe integers are canonical"); return String(value); }
  if (typeof value === "string") return JSON.stringify(validateString(value));
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(validateString(key))}:${canonicalize(value[key])}`).join(",")}}`;
  fail("TYPE_UNSUPPORTED", "unsupported canonical JSON type");
}
export function canonicalBytes(value) { return Buffer.from(canonicalize(value), "utf8"); }
export function canonicalDigest(value) { return createHash("sha256").update(canonicalBytes(value)).digest("hex"); }
export function requireCanonicalBytes(bytes) { const value = parseStrictJson(bytes); if (!Buffer.from(bytes).equals(canonicalBytes(value))) fail("JSON_NONCANONICAL", "input bytes are not canonical"); return value; }
