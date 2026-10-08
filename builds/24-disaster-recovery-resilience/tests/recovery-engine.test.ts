import { describe, expect, it } from "vitest";
import { evaluateRecovery } from "../src/recovery-engine";

describe("Build 24 recovery engine", () => {
  it("enters emergency handling when restore verification fails", async () => {
    let mode = "";
    let event = "";

    const result = await evaluateRecovery(
      {
        recordEvent: async (type) => {
          event = type;
        },
        activateMode: async (nextMode) => {
          mode = nextMode;
        },
        reconcile: async () => ({ complete: false, discrepancies: 1 }),
      },
      { rtoSeconds: 300, rpoSeconds: 60 },
      {
        restoreSeconds: 100,
        dataAgeSeconds: 20,
        verificationPassed: false,
      },
    );

    expect(result.recoverable).toBe(false);
    expect(mode).toBe("emergency");
    expect(event).toBe("recovery.verification.failed");
  });

  it("detects missed RTO/RPO and uses degraded continuity", async () => {
    let mode = "";

    const result = await evaluateRecovery(
      {
        recordEvent: async () => {},
        activateMode: async (nextMode) => {
          mode = nextMode;
        },
        reconcile: async () => ({ complete: true, discrepancies: 0 }),
      },
      { rtoSeconds: 300, rpoSeconds: 60 },
      {
        restoreSeconds: 500,
        dataAgeSeconds: 90,
        verificationPassed: true,
      },
    );

    expect(result.rtoMet).toBe(false);
    expect(result.rpoMet).toBe(false);
    expect(mode).toBe("degraded");
  });

  it("reports recoverable only after verification and reconciliation", async () => {
    const result = await evaluateRecovery(
      {
        recordEvent: async () => {},
        activateMode: async () => {},
        reconcile: async () => ({ complete: true, discrepancies: 0 }),
      },
      { rtoSeconds: 300, rpoSeconds: 60 },
      {
        restoreSeconds: 100,
        dataAgeSeconds: 20,
        verificationPassed: true,
      },
    );

    expect(result.recoverable).toBe(true);
    expect(result.rtoMet).toBe(true);
    expect(result.rpoMet).toBe(true);
  });
});
