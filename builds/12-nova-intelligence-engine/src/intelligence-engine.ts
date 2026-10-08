export type IntelligenceOutputType =
  | "explanation"
  | "summary"
  | "prediction"
  | "recommendation";

export interface IntelligenceContext {
  tenantId: string;
  userId: string;
  purpose: string;
  subjectType?: string;
  subjectId?: string;
}

export interface EvidenceRef {
  id: string;
  authority: string;
  relevance: number;
  excerpt?: string;
}

export interface IntelligenceOutput {
  type: IntelligenceOutputType;
  content: Record<string, unknown>;
  confidence: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresReview: boolean;
  evidence: EvidenceRef[];
}

export interface IntelligenceDependencies {
  retrieve(context: IntelligenceContext): Promise<EvidenceRef[]>;
  reason(context: IntelligenceContext, evidence: EvidenceRef[]): Promise<IntelligenceOutput>;
  recordRun(context: IntelligenceContext): Promise<string>;
  recordOutput(runId: string, output: IntelligenceOutput): Promise<void>;
}

export async function runIntelligence(
  deps: IntelligenceDependencies,
  context: IntelligenceContext,
): Promise<{ runId: string; output: IntelligenceOutput }> {
  const runId = await deps.recordRun(context);
  const evidence = await deps.retrieve(context);

  if (evidence.length === 0) {
    const output: IntelligenceOutput = {
      type: "explanation",
      content: {
        status: "insufficient_context",
        message: "There is not enough authorized evidence to produce a reliable conclusion.",
      },
      confidence: 0,
      riskLevel: "medium",
      requiresReview: true,
      evidence: [],
    };

    await deps.recordOutput(runId, output);
    return { runId, output };
  }

  const output = await deps.reason(context, evidence);
  await deps.recordOutput(runId, output);

  return { runId, output };
}
