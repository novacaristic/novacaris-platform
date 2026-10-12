import { createPublicKey, verify as verifySignature } from "node:crypto";
import { Pool } from "pg";

const issuer = process.env.COGNITO_ISSUER?.trim();
const clientId = process.env.COGNITO_CLIENT_ID?.trim();
const tenantClaim = process.env.NOVA_COGNITO_TENANT_CLAIM?.trim() || "custom:tenant_id";
let jwksCache;
let jwksExpiresAt = 0;
let auditPool;
const decisionByContext = new WeakMap();

function required(value, name) { if (!value) throw new Error("STARTUP_BLOCKED_MISSING_" + name); return value; }
function decodePart(part) { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")); }
function safeId() { return crypto.randomUUID(); }
function configuredIssuer() {
  const value = required(issuer, "COGNITO_ISSUER");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.pathname === "/" || parsed.search || parsed.hash) throw new Error("COGNITO_ISSUER_MUST_BE_HTTPS_USER_POOL_ISSUER");
  return value.replace(/\/$/, "");
}
function bearer(request) {
  const headers = request?.headers ?? {};
  const raw = headers.authorization ?? headers.Authorization;
  return typeof raw === "string" && raw.startsWith("Bearer ") ? raw.slice(7).trim() || null : null;
}
async function jwks() {
  if (jwksCache && Date.now() < jwksExpiresAt) return jwksCache;
  const response = await fetch(configuredIssuer() + "/.well-known/jwks.json", { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("COGNITO_JWKS_UNAVAILABLE");
  const body = await response.json();
  if (!Array.isArray(body.keys) || !body.keys.length) throw new Error("COGNITO_JWKS_INVALID");
  jwksCache = body.keys;
  jwksExpiresAt = Date.now() + 300000;
  return jwksCache;
}
async function verifyAccessToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("TOKEN_INVALID");
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("TOKEN_ALGORITHM_REJECTED");
  const key = (await jwks()).find(k => k.kid === header.kid && k.kty === "RSA" && k.use === "sig" && (!k.alg || k.alg === "RS256"));
  if (!key) throw new Error("TOKEN_SIGNING_KEY_UNKNOWN");
  const publicKey = createPublicKey({ key, format: "jwk" });
  if (!verifySignature("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), publicKey, Buffer.from(parts[2], "base64url"))) throw new Error("TOKEN_SIGNATURE_INVALID");
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== configuredIssuer()) throw new Error("TOKEN_ISSUER_INVALID");
  if (!Number.isFinite(claims.exp) || claims.exp <= now) throw new Error("TOKEN_EXPIRED");
  if (Number.isFinite(claims.nbf) && claims.nbf > now + 5) throw new Error("TOKEN_NOT_YET_VALID");
  if (claims.token_use !== "access") throw new Error("ACCESS_TOKEN_REQUIRED");
  if (claims.client_id !== required(clientId, "COGNITO_CLIENT_ID")) throw new Error("TOKEN_CLIENT_INVALID");
  if (typeof claims.sub !== "string" || !claims.sub.trim()) throw new Error("TOKEN_SUBJECT_INVALID");
  if (typeof claims[tenantClaim] !== "string" || !claims[tenantClaim].trim()) throw new Error("TENANT_CLAIM_REQUIRED");
  return claims;
}
function actorRole(claims) {
  const groups = Array.isArray(claims["cognito:groups"]) ? claims["cognito:groups"] : [];
  for (const [env, role] of [["NOVA_COGNITO_GROUP_ADMIN","administrator"],["NOVA_COGNITO_GROUP_SUPERVISOR","supervisor"],["NOVA_COGNITO_GROUP_OWNER","owner"],["NOVA_COGNITO_GROUP_CLINICIAN","clinician"],["NOVA_COGNITO_GROUP_AGENT","agent"]]) {
    const group = process.env[env]?.trim();
    if (group && groups.includes(group)) return role;
  }
  return null;
}
function permissions(claims) {
  const value = claims["custom:permissions"];
  if (Array.isArray(value)) return value.filter(v => typeof v === "string");
  return typeof value === "string" ? value.split(",").map(v => v.trim()).filter(Boolean) : [];
}
const roleCapabilities = {
  clinician: new Set(["workspace.note.create","workspace.note.check","workspace.note.submit"]),
  supervisor: new Set(["workspace.note.create","workspace.note.check","workspace.note.submit","workspace.note.approve","workspace.note.request_changes"]),
  administrator: new Set(["workspace.note.create","workspace.note.check","workspace.note.submit","workspace.note.approve","workspace.note.request_changes","recovery.read","recovery.escalation.open","recovery.escalation.acknowledge","recovery.escalation.assign","recovery.escalation.resolve","recovery.execution.review","agent.manage","agent.delegate"]),
  owner: new Set(["workspace.note.create","workspace.note.check","workspace.note.submit","agent.manage","agent.delegate"]),
  agent: new Set([])
};
function auditPoolInstance() {
  if (auditPool) return auditPool;
  auditPool = new Pool({ connectionString: required(process.env.DATABASE_URL, "DATABASE_URL"), max: 3, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, ssl: process.env.NOVA_DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined });
  auditPool.on("error", () => {});
  return auditPool;
}
async function writeDecision(e) {
  await auditPoolInstance().query(
    "INSERT INTO nova_security.authorization_audit (event_id, occurred_at, request_id, correlation_id, tenant_id, actor_sub, actor_role, action, decision, reason_code) VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9)",
    [e.eventId,e.requestId,e.correlationId,e.tenantId,e.actorSub,e.role,e.action,e.decision,e.reason]
  );
}
export async function resolveContext(request) {
  const requestId = safeId();
  const correlationId = typeof request?.headers?.["x-correlation-id"] === "string" ? request.headers["x-correlation-id"].slice(0,128) : safeId();
  try {
    const token = bearer(request);
    if (!token) return null;
    const claims = await verifyAccessToken(token);
    const role = actorRole(claims);
    if (!role) return null;
    const context = { contractVersion:"1.0", requestId, correlationId, tenantId:claims[tenantClaim], actor:{type:"user",reference:claims.sub}, sessionReference:typeof claims.origin_jti === "string" ? claims.origin_jti : undefined, authorizationDecisionReference:safeId() };
    decisionByContext.set(context, { claims, role, permissions:permissions(claims) });
    await writeDecision({eventId:safeId(),requestId,correlationId,tenantId:context.tenantId,actorSub:claims.sub,role,action:"session.authenticate",decision:"allow",reason:"TOKEN_VALID"});
    return context;
  } catch {
    return null;
  }
}
export async function resolveWorkspaceContext(request) {
  const context = await resolveContext(request);
  if (!context) return null;
  const identity = decisionByContext.get(context);
  if (!identity) return null;
  const workspaceContext = { tenantId:context.tenantId, actor:{type:"user",reference:context.actor.reference,role:identity.role}, authorizationDecisionReference:context.authorizationDecisionReference };\n  decisionByContext.set(workspaceContext, identity);\n  return workspaceContext;
}
export async function authorize(context, action) {
  const identity = context && decisionByContext.get(context);
  const validAction = typeof action === "string" && /^[a-z][a-z0-9._:-]{1,127}$/.test(action);
  const roleAllows = Boolean(identity && validAction && roleCapabilities[identity.role]?.has(action));
  const explicitAllows = Boolean(identity && identity.permissions.includes(action));
  const allowed = roleAllows && (identity.role === "administrator" || identity.permissions.length === 0 || explicitAllows);
  const event = {eventId:safeId(),requestId:context?.requestId || safeId(),correlationId:context?.correlationId || safeId(),tenantId:context?.tenantId || "unknown",actorSub:context?.actor?.reference || "unknown",role:identity?.role || "unknown",action:validAction?action:"invalid_action",decision:allowed?"allow":"deny",reason:allowed?"ROLE_POLICY_ALLOW":"DEFAULT_DENY"};
  try { await writeDecision(event); } catch { return false; }
  return allowed;
}
export async function closeSecurityAdapter() {
  if (auditPool) { const pool = auditPool; auditPool = undefined; await pool.end(); }
}
