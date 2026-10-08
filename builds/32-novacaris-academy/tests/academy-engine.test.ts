import { describe, expect, it } from "vitest";
import {
  evaluateCourseCompletion,
  recordCourseCompletion,
} from "../src/academy-engine";

describe("Build 32 Academy engine", () => {
  it("blocks completion when a required module is incomplete", () => {
    const result = evaluateCourseCompletion({
      requiredModules: [
        { key: "intro", complete: true },
        { key: "safety", complete: false },
      ],
      requiredAssessments: [],
    });

    expect(result.complete).toBe(false);
    expect(result.blockers).toContain("MODULE_INCOMPLETE:safety");
  });

  it("requires assessment pass and minimum score when configured", () => {
    const result = evaluateCourseCompletion({
      requiredModules: [{ key: "lesson-1", complete: true }],
      requiredAssessments: [{ key: "quiz-1", passed: false }],
      minimumScore: 80,
      observedScore: 72,
    });

    expect(result.complete).toBe(false);
    expect(result.blockers).toContain("ASSESSMENT_NOT_PASSED:quiz-1");
    expect(result.blockers).toContain("MINIMUM_SCORE_NOT_MET");
  });

  it("records completion only when all configured requirements pass", async () => {
    let recorded = false;

    await recordCourseCompletion(
      {
        recordEvent: async () => {},
        recordCompletion: async () => {
          recorded = true;
        },
        issueCertificate: async () => {},
      },
      {
        requiredModules: [{ key: "lesson-1", complete: true }],
        requiredAssessments: [{ key: "quiz-1", passed: true }],
        minimumScore: 80,
        observedScore: 90,
      },
    );

    expect(recorded).toBe(true);
  });
});
