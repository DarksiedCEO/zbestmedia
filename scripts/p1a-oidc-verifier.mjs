import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";

const ISSUER = "https://token.actions.githubusercontent.com";
const decodeJson = (segment, label) => {
  try { return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")); }
  catch { throw new Error(`${label} is not valid base64url JSON`); }
};

export function verifyGitHubOidcToken(token, jwks, expected, nowSeconds = Math.floor(Date.now() / 1000)) {
  assert.equal(typeof token, "string", "OIDC token absent");
  const parts = token.split(".");
  assert.equal(parts.length, 3, "OIDC token must be a signed JWT");
  const header = decodeJson(parts[0], "OIDC header");
  const claims = decodeJson(parts[1], "OIDC claims");
  assert.equal(header.alg, "RS256", "OIDC algorithm must be RS256");
  assert.match(header.kid ?? "", /^[A-Za-z0-9._-]+$/u, "OIDC key id invalid");
  const keys = jwks?.keys?.filter((key) => key.kid === header.kid && key.kty === "RSA" && (!key.use || key.use === "sig")) ?? [];
  assert.equal(keys.length, 1, "OIDC signing key missing or ambiguous");
  const key = createPublicKey({ key: keys[0], format: "jwk" });
  assert.ok(verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url")), "OIDC signature invalid");
  assert.equal(claims.iss, ISSUER, "OIDC issuer mismatch");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  assert.ok(audiences.includes(expected.audience), "OIDC audience mismatch");
  assert.equal(claims.sub, expected.subject, "OIDC subject mismatch");
  assert.equal(claims.repository, expected.repository, "OIDC repository mismatch");
  assert.equal(String(claims.repository_owner_id), String(expected.repositoryOwnerId), "OIDC repository owner id mismatch");
  assert.equal(claims.ref, expected.ref, "OIDC ref mismatch");
  assert.equal(claims.workflow_ref, expected.workflowRef, "OIDC workflow ref mismatch");
  assert.equal(claims.workflow_sha, expected.workflowSha, "OIDC workflow SHA mismatch");
  assert.equal(claims.environment, expected.environment, "OIDC environment mismatch");
  assert.match(String(claims.iat), /^[0-9]+$/u, "OIDC issued-at missing");
  assert.match(String(claims.nbf), /^[0-9]+$/u, "OIDC not-before missing");
  assert.match(String(claims.exp), /^[0-9]+$/u, "OIDC expiration missing");
  assert.ok(Number(claims.iat) <= nowSeconds + 30, "OIDC issued-at is in the future");
  assert.ok(Number(claims.nbf) <= nowSeconds, "OIDC token not yet valid");
  assert.ok(Number(claims.exp) > nowSeconds, "OIDC token expired");
  assert.ok(Number(claims.exp) - Number(claims.iat) <= 900, "OIDC token lifetime exceeds policy");
  return { issuer: claims.iss, audience: expected.audience, subject: claims.sub, repository: claims.repository, ref: claims.ref, workflowRef: claims.workflow_ref, workflowSha: claims.workflow_sha, environment: claims.environment, issuedAt: claims.iat, notBefore: claims.nbf, expiresAt: claims.exp, keyId: header.kid, signature: "VERIFIED" };
}

export async function acquireAndVerifyGitHubOidc(expected, env = process.env, fetchImpl = fetch) {
  assert.ok(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, "GitHub OIDC request authority absent");
  const requestUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  assert.equal(requestUrl.protocol, "https:", "OIDC request must use HTTPS");
  requestUrl.searchParams.set("audience", expected.audience);
  const tokenResponse = await fetchImpl(requestUrl, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, redirect: "error" });
  assert.equal(tokenResponse.status, 200, "GitHub OIDC token acquisition failed");
  const { value: token } = await tokenResponse.json();
  const discoveryResponse = await fetchImpl(`${ISSUER}/.well-known/openid-configuration`, { redirect: "error" });
  assert.equal(discoveryResponse.status, 200, "OIDC discovery failed");
  const discovery = await discoveryResponse.json();
  assert.equal(discovery.issuer, ISSUER, "OIDC discovery issuer mismatch");
  const jwksUrl = new URL(discovery.jwks_uri);
  assert.equal(jwksUrl.origin, ISSUER, "OIDC JWKS authority mismatch");
  const jwksResponse = await fetchImpl(jwksUrl, { redirect: "error" });
  assert.equal(jwksResponse.status, 200, "OIDC JWKS acquisition failed");
  return verifyGitHubOidcToken(token, await jwksResponse.json(), expected);
}
