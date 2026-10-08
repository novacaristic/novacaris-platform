export interface OpportunityAssessmentInput {
  eligibilityConfidence: number;
  readinessScore: number;
  evidenceCompleteness: number;
  strategicFit: number;
  deadlineFeasibility: number;
}

export interface OpportunityAssessment {
  score: number;
  status: "PRIORITIZE" | "CONSIDER" | "PREPARE" | "DO_NOT_PRIORITIZE";
  rationale: string;
}

export function assessOpportunity(
  input: OpportunityAssessmentInput,
): OpportunityAssessment {
  const score =
    input.eligibilityConfidence * 0.25 +
    input.readinessScore * 0.30 +
    input.evidenceCompleteness * 0.20 +
    input.strategicFit * 0.15 +
    input.deadlineFeasibility * 0.10;

  if (score >= 85) {
    return {
      score,
      status: "PRIORITIZE",
      rationale: "Strong eligibility, readiness and strategic fit.",
    };
  }

  if (score >= 70) {
    return {
      score,
      status: "CONSIDER",
      rationale: "Opportunity is plausible with manageable preparation.",
    };
  }

  if (score >= 50) {
    return {
      score,
      status: "PREPARE",
      rationale: "Material readiness or evidence gaps should be addressed first.",
    };
  }

  return {
    score,
    status: "DO_NOT_PRIORITIZE",
    rationale: "Current readiness, eligibility or feasibility is too weak.",
  };
}
