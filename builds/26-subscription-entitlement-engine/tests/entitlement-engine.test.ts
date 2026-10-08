import { describe, expect, it } from "vitest";
import {
  checkEntitlement,
  recordEntitledUsage,
} from "../src/entitlement-engine";

describe("Build 26 entitlement engine", () => {
  it("allows an entitled feature within its limit", async () => {
    const result = await checkEntitlement(
      {
        getEntitlement: async () => ({
          featureKey: "novaclerk.voice",
          status: "enabled",
          limitValue: 100,
          limitUnit: "minutes",
        }),
        getUsage: async () => 40,
        recordUsage: async () => {},
      },
      "tenant-1",
      "novaclerk.voice",
      20,
    );

    expect(result.allowed).toBe(true);
  });

  it("blocks a feature when the tenant is not entitled", async () => {
    const result = await checkEntitlement(
      {
        getEntitlement: async () => null,
        getUsage: async () => 0,
        recordUsage: async () => {},
      },
      "tenant-1",
      "nova.funding",
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("FEATURE_NOT_ENTITLED");
  });

  it("blocks usage above the entitlement limit", async () => {
    const result = await checkEntitlement(
      {
        getEntitlement: async () => ({
          featureKey: "api.calls",
          status: "enabled",
          limitValue: 100,
          limitUnit: "calls",
        }),
        getUsage: async () => 95,
        recordUsage: async () => {},
      },
      "tenant-1",
      "api.calls",
      10,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("USAGE_LIMIT_EXCEEDED");
  });

  it("records usage only after entitlement succeeds", async () => {
    let recorded = false;

    await recordEntitledUsage(
      {
        getEntitlement: async () => ({
          featureKey: "novaclerk.voice",
          status: "enabled",
          limitValue: 100,
          limitUnit: "minutes",
        }),
        getUsage: async () => 10,
        recordUsage: async () => {
          recorded = true;
        },
      },
      "tenant-1",
      "novaclerk.voice",
      5,
      "usage-1",
    );

    expect(recorded).toBe(true);
  });
});
