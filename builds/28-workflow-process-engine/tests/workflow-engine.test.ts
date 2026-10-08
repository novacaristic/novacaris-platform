import { describe, expect, it } from "vitest";
import {
  getReadySteps,
  executeStep,
} from "../src/workflow-engine";

describe("Build 28 workflow engine", () => {
  it("returns only steps whose dependencies are complete", () => {
    const ready = getReadySteps([
      {
        key: "collect_evidence",
        required: true,
        dependencies: [],
        status: "complete",
      },
      {
        key: "verify_evidence",
        required: true,
        dependencies: ["collect_evidence"],
        status: "pending",
      },
      {
        key: "activate",
        required: true,
        dependencies: ["verify_evidence"],
        status: "pending",
      },
    ]);

    expect(ready.map((step) => step.key)).toEqual(["verify_evidence"]);
  });

  it("blocks a step when authorization is denied", async () => {
    let escalated = false;

    const result = await executeStep(
      {
        recordEvent: async () => {},
        authorize: async () => false,
        execute: async () => ({ success: true }),
        createEscalation: async () => {
          escalated = true;
        },
      },
      {
        key: "external_ehr_write",
        required: true,
        dependencies: [],
        status: "ready",
      },
    );

    expect(result.status).toBe("blocked");
    expect(escalated).toBe(true);
  });

  it("executes an authorized successful step", async () => {
    const result = await executeStep(
      {
        recordEvent: async () => {},
        authorize: async () => true,
        execute: async () => ({ success: true }),
        createEscalation: async () => {},
      },
      {
        key: "prepare_document",
        required: true,
        dependencies: [],
        status: "ready",
      },
    );

    expect(result.status).toBe("completed");
  });

  it("escalates execution failure", async () => {
    let reason = "";

    const result = await executeStep(
      {
        recordEvent: async () => {},
        authorize: async () => true,
        execute: async () => ({
          success: false,
          error: "EHR_TIMEOUT",
        }),
        createEscalation: async (_step, failureReason) => {
          reason = failureReason;
        },
      },
      {
        key: "ehr_sync",
        required: true,
        dependencies: [],
        status: "ready",
      },
    );

    expect(result.status).toBe("failed");
    expect(reason).toBe("EHR_TIMEOUT");
  });
});
