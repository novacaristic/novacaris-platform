import { describe, expect, it } from "vitest";
import { routeTask } from "../src/agent-orchestrator";

describe("Build 18 agent orchestrator", () => {
  it("routes work to an active specialist", async () => {
    const result = await routeTask(
      {
        resolveAgent: async () => ({ id: "a-2", key: "nova-compliance", status: "active" }),
        createTask: async () => "task-1",
        recordHandoff: async () => {},
      },
      { id: "a-1", key: "mr-nova", status: "active" },
      "nova-compliance",
      "Assess requirement gap.",
    );

    expect(result.taskId).toBe("task-1");
    expect(result.target.key).toBe("nova-compliance");
  });

  it("fails when target agent is disabled", async () => {
    await expect(
      routeTask(
        {
          resolveAgent: async () => ({ id: "a-2", key: "nova-compliance", status: "disabled" }),
          createTask: async () => "task-2",
          recordHandoff: async () => {},
        },
        { id: "a-1", key: "mr-nova", status: "active" },
        "nova-compliance",
        "Assess requirement gap.",
      ),
    ).rejects.toThrow("TARGET_AGENT_UNAVAILABLE");
  });
});
