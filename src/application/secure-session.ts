import { randomBytes } from "node:crypto";

export function createSecureSessionId(): string {
  return randomBytes(32).toString("base64url");
}
