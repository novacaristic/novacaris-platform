export type WorkspaceRole =
  | "OWNER"
  | "ADMIN"
  | "COMPLIANCE"
  | "OPERATIONS"
  | "CLINICAL"
  | "FINANCE"
  | "VIEWER";

export interface IdentityClaims {
  subject: string;
  issuer: string;
  email?: string;
  name?: string;
  expiresAt: number;
}

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  organizationId: string;
  roles: WorkspaceRole[];
  claims: IdentityClaims;
  authenticatedAt: string;
}

export interface IdentityVerifier {
  verify(token: string): Promise<IdentityClaims>;
}

export interface MembershipResolver {
  rolesFor(userId: string, organizationId: string): Promise<WorkspaceRole[]>;
}

import { createSecureSessionId } from "./secure-session.js";

export async function createSession(
  token: string,
  organizationId: string,
  verifier: IdentityVerifier,
  membership: MembershipResolver,
): Promise<AuthenticatedSession> {
  const claims = await verifier.verify(token);
  if (!claims.subject) throw new Error("Identity subject is required.");
  if (claims.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("Identity token is expired.");
  }

  const roles = await membership.rolesFor(claims.subject, organizationId);
  if (!roles.length) throw new Error("User is not a member of this organization.");

  return {
    sessionId: createSecureSessionId(),
    userId: claims.subject,
    organizationId,
    roles,
    claims,
    authenticatedAt: new Date().toISOString(),
  };
}

export function hasRole(
  session: AuthenticatedSession,
  ...allowed: WorkspaceRole[]
): boolean {
  return allowed.some((role) => session.roles.includes(role));
}

export function requireRole(
  session: AuthenticatedSession,
  ...allowed: WorkspaceRole[]
): void {
  if (!hasRole(session, ...allowed)) {
    throw new Error("Insufficient workspace role.");
  }
}

export function assertOrganizationScope(
  session: AuthenticatedSession,
  organizationId: string,
): void {
  if (session.organizationId !== organizationId) {
    throw new Error("Organization scope mismatch.");
  }
}
