import { describe, expect, it } from "vitest";
import { promoteRelease } from "../src/release-control";

const release = {
  id: "rel-1",
  version: "23.0.0",
  sourceRevision: "abc123",
  status: "approved" as const,
};

describe("Build 23 release control", () => {
  it("blocks unapproved production releases", async () => {
    const result = await promoteRelease(
      {
        recordEvent: async () => {},
        verify: async () => [],
        approve: async () => false,
        deploy: async () => "dep-1",
        rollback: async () => {},
      },
      { ...release, status: "validated" },
      "production",
    );

    expect(result.promoted).toBe(false);
  });

  it("rolls back when a required verification gate fails", async () => {
    let rolledBack = false;

    const result = await promoteRelease(
      {
        recordEvent: async () => {},
        verify: async () => [
          { key: "health", passed: true, required: true },
          { key: "migration", passed: false, required: true },
        ],
        approve: async () => true,
        deploy: async () => "dep-1",
        rollback: async () => {
          rolledBack = true;
        },
      },
      release,
      "production",
    );

    expect(result.promoted).toBe(false);
    expect(rolledBack).toBe(true);
  });

  it("promotes when required verification gates pass", async () => {
    const result = await promoteRelease(
      {
        recordEvent: async () => {},
        verify: async () => [
          { key: "health", passed: true, required: true },
        ],
        approve: async () => true,
        deploy: async () => "dep-1",
        rollback: async () => {},
      },
      release,
      "production",
    );

    expect(result.promoted).toBe(true);
    expect(result.deploymentId).toBe("dep-1");
  });
});
