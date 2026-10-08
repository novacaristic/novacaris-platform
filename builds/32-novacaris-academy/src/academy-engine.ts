export interface CourseCompletionInput {
  requiredModules: Array<{ key: string; complete: boolean }>;
  requiredAssessments: Array<{ key: string; passed: boolean }>;
  minimumScore?: number;
  observedScore?: number;
}

export interface AcademyDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  recordCompletion(): Promise<void>;
  issueCertificate(): Promise<void>;
}

export function evaluateCourseCompletion(
  input: CourseCompletionInput,
): { complete: boolean; blockers: string[] } {
  const blockers: string[] = [];

  for (const module of input.requiredModules) {
    if (!module.complete) blockers.push(`MODULE_INCOMPLETE:${module.key}`);
  }

  for (const assessment of input.requiredAssessments) {
    if (!assessment.passed) blockers.push(`ASSESSMENT_NOT_PASSED:${assessment.key}`);
  }

  if (
    input.minimumScore !== undefined &&
    (input.observedScore === undefined || input.observedScore < input.minimumScore)
  ) {
    blockers.push("MINIMUM_SCORE_NOT_MET");
  }

  return { complete: blockers.length === 0, blockers };
}

export async function recordCourseCompletion(
  deps: AcademyDependencies,
  input: CourseCompletionInput,
): Promise<void> {
  const result = evaluateCourseCompletion(input);

  if (!result.complete) {
    await deps.recordEvent("academy.completion.blocked", {
      blockers: result.blockers,
    });
    throw new Error("COURSE_COMPLETION_REQUIREMENTS_NOT_MET");
  }

  await deps.recordCompletion();
  await deps.recordEvent("academy.completion.recorded", {});
}
