import { describe, expect, it } from "vitest";
import { processKnowledgeVersion } from "../src/regulatory-engine";

describe("Build 13 regulatory engine", () => {
  it("routes substantive changes for human review", async () => {
    const result = await processKnowledgeVersion(
      {
        compare: async () => ({
          type: "substantive",
          summary: "Requirement changed",
          requiresHumanReview: true,
        }),
        createInterpretation: async () => "interpretation-1",
        mapRequirements: async () => ["requirement-1"],
        emitChangeEvent: async () => {},
      },
      null,
      {
        sourceId: "source-1",
        versionId: "version-2",
        contentHash: "hash-2",
      },
    );

    expect(result.reviewRequired).toBe(true);
    expect(result.requirementIds).toContain("requirement-1");
  });

  it("preserves a non-substantive change without forcing a false review", async () => {
    const result = await processKnowledgeVersion(
      {
        compare: async () => ({
          type: "wording",
          summary: "Formatting changed",
          requiresHumanReview: false,
        }),
        createInterpretation: async () => "interpretation-2",
        mapRequirements: async () => [],
        emitChangeEvent: async () => {},
      },
      null,
      {
        sourceId: "source-1",
        versionId: "version-3",
        contentHash: "hash-3",
      },
    );

    expect(result.reviewRequired).toBe(false);
  });
});
