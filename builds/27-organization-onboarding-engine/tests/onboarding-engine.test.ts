import { describe, expect, it } from "vitest";
import {
  evaluateActivation,
  activateOnboarding,
} from "../src/onboarding-engine";

describe("Build 27 onboarding engine", () => {
  it("blocks activation when required stages are incomplete", async () => {
    let blocked = false;

    const result = await evaluateActivation(
      {
        recordEvent: async (type) => {
          blocked = type === "onboarding.activation.blocked";
        },
        evaluateReadiness: async () => ({
          ready: true,
          blockers: [],
        }),
        activateTenant: async () => {},
      },
      [
        { key: "organization_profile", required: true, status: "complete" },
        { key: "integrations", required: true, status: "pending" },
      ],
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("integrations");
    expect(blocked).toBe(true);
  });

  it("blocks activation when readiness has critical blockers", async () => {
    const result = await evaluateActivation(
      {
        recordEvent: async () => {},
        evaluateReadiness: async () => ({
          ready: false,
          blockers: ["critical_evidence"],
        }),
        activateTenant: async () => {},
      },
      [
        { key: "organization_profile", required: true, status: "complete" },
      ],
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("critical_evidence");
  });

  it("activates only when required stages and readiness pass", async () => {
    let activated = false;

    await activateOnboarding(
      {
        recordEvent: async () => {},
        evaluateReadiness: async () => ({
          ready: true,
          blockers: [],
        }),
        activateTenant: async () => {
          activated = true;
        },
      },
      [
        { key: "organization_profile", required: true, status: "complete" },
        { key: "users_and_roles", required: true, status: "complete" },
      ],
    );

    expect(activated).toBe(true);
  });
});
