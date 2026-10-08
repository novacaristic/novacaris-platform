import { describe, expect, it } from "vitest";
import { verifyEvidence } from "../src/evidence-engine";

describe("Build 14 evidence engine", () => {
  it("persists and emits verification results", async () => {
    let persisted = false;
    let emitted = false;

    const result = await verifyEvidence(
      {
        createRequest: async () => "request-1",
        validate: async () => ({
          evidenceId: "evidence-1",
          result: "verified",
          confidence: 0.98,
          rationale: "All configured checks passed.",
        }),
        persistVerification: async () => { persisted = true; },
        emitVerificationEvent: async () => { emitted = true; },
      },
      {
        evidenceId: "evidence-1",
        requestId: "request-1",
        contentHash: "hash-1",
        metadata: {},
      },
    );

    expect(result.result).toBe("verified");
    expect(persisted).toBe(true);
    expect(emitted).toBe(true);
  });

  it("supports insufficient evidence without declaring failure", async () => {
    const result = await verifyEvidence(
      {
        createRequest: async () => "request-2",
        validate: async () => ({
          evidenceId: "evidence-2",
          result: "insufficient",
          confidence: 0.75,
          rationale: "Document is authentic but does not cover the required period.",
        }),
        persistVerification: async () => {},
        emitVerificationEvent: async () => {},
      },
      {
        evidenceId: "evidence-2",
        requestId: "request-2",
        contentHash: "hash-2",
        metadata: {},
      },
    );

    expect(result.result).toBe("insufficient");
  });
});
