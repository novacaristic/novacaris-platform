import type { ApplicationHealth } from "./contracts.js";

export const APPLICATION_VERSION = "0.1.0";

export function health(): ApplicationHealth {
  return { ok: true, service: "novacaris-application", version: APPLICATION_VERSION };
}
