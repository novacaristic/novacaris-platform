export interface EvidenceUploadPolicy {
  allowedKinds: string[];
  maxPayloadBytes: number;
  requiresHumanReviewKinds: string[];
}

export interface EvidenceUploadDecision {
  allowed: boolean;
  requiresHumanReview: boolean;
  reasons: string[];
}

export function evaluateEvidenceUpload(
  policy: EvidenceUploadPolicy,
  kind: string,
  payloadBytes: number,
): EvidenceUploadDecision {
  const reasons: string[] = [];

  if (!policy.allowedKinds.includes(kind)) {
    reasons.push("Evidence kind is not allowed by the current policy.");
  }

  if (payloadBytes > policy.maxPayloadBytes) {
    reasons.push("Evidence payload exceeds the configured size limit.");
  }

  return {
    allowed: reasons.length === 0,
    requiresHumanReview: policy.requiresHumanReviewKinds.includes(kind),
    reasons,
  };
}
