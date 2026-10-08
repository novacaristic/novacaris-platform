export interface EvidenceRequest {
  requestId: string;
  requirementId?: string;
  evidenceType: string;
  title: string;
  description: string;
}

export interface EvidenceSubmission {
  evidenceId: string;
  requestId: string;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface VerificationResult {
  evidenceId: string;
  result: "verified" | "insufficient" | "rejected" | "needs_review";
  confidence: number;
  rationale: string;
}

export interface EvidenceDependencies {
  createRequest(request: EvidenceRequest): Promise<string>;
  validate(submission: EvidenceSubmission): Promise<VerificationResult>;
  persistVerification(result: VerificationResult): Promise<void>;
  emitVerificationEvent(result: VerificationResult): Promise<void>;
}

export async function verifyEvidence(
  deps: EvidenceDependencies,
  submission: EvidenceSubmission,
): Promise<VerificationResult> {
  const result = await deps.validate(submission);
  await deps.persistVerification(result);
  await deps.emitVerificationEvent(result);
  return result;
}
