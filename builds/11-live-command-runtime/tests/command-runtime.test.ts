import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/command-runtime";

describe("Build 11 command runtime", () => {
  const context = {
    tenantId: "tenant-1",
    userId: "user-1",
    sessionId: "session-1",
  };

  it("fails closed when policy denies", async () => {
    const deps = {
      authorizeCommand: async () => ({
        allowed: false,
        requiresAuthorization: true,
        reason: "policy denied",
      }),
      createInvestigation: async () => ({}),
      createPreparation: async () => ({}),
      createApprovalRequest: async () => ({}),
      persistCommand: async () => "command-1",
    };

    const result = await executeCommand(deps, context, {
      type: "investigate",
      payload: { question: "test" },
    });

    expect(result.status).toBe("denied");
    expect(result.policy.allowed).toBe(false);
  });

  it("routes an investigation only after policy approval", async () => {
    let called = false;
    const deps = {
      authorizeCommand: async () => ({
        allowed: true,
        requiresAuthorization: false,
      }),
      createInvestigation: async () => {
        called = true;
        return { taskId: "task-1" };
      },
      createPreparation: async () => ({}),
      createApprovalRequest: async () => ({}),
      persistCommand: async () => "command-2",
    };

    const result = await executeCommand(deps, context, {
      type: "investigate",
      payload: { question: "Why is readiness below target?" },
    });

    expect(called).toBe(true);
    expect(result.status).toBe("accepted");
  });
});
