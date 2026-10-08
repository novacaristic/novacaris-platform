export interface ReadinessInput {
  evidenceCoverage: number;
  verifiedCompliance: number;
  criticalGapPenalty: number;
  correctiveActionCompletion: number;
  criticalGaps: number;
  expiredCriticalEvidence: number;
}

export interface ReadinessResult {
  score: number;
  status: "READY" | "READY WITH CONDITIONS" | "DEVELOPING" | "NOT READY";
  rationale: string;
}

export function calculateReadiness(input: ReadinessInput): ReadinessResult {
  const score =
    input.evidenceCoverage * 0.30 +
    input.verifiedCompliance * 0.35 +
    input.criticalGapPenalty * 0.20 +
    input.correctiveActionCompletion * 0.15;

  if (input.criticalGaps > 0 || input.expiredCriticalEvidence > 0) {
    return {
      score,
      status: "NOT READY",
      rationale: "A critical unresolved gap or expired critical evidence overrides the numerical score.",
    };
  }

  if (score >= 90) {
    return { score, status: "READY", rationale: "Score meets READY threshold with no critical override." };
  }

  if (score >= 75) {
    return { score, status: "READY WITH CONDITIONS", rationale: "Score meets conditional readiness threshold." };
  }

  if (score >= 50) {
    return { score, status: "DEVELOPING", rationale: "Readiness is developing and material gaps remain." };
  }

  return { score, status: "NOT READY", rationale: "Readiness score is below the minimum threshold." };
}
