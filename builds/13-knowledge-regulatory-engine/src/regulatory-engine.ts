export type ChangeType =
  | "administrative"
  | "wording"
  | "substantive"
  | "effective_date"
  | "applicability"
  | "unknown";

export interface KnowledgeVersion {
  sourceId: string;
  versionId: string;
  contentHash: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  canonicalUri?: string;
}

export interface ChangeAssessment {
  type: ChangeType;
  summary: string;
  requiresHumanReview: boolean;
}

export interface RegulatoryDependencies {
  compare(previous: KnowledgeVersion | null, current: KnowledgeVersion): Promise<ChangeAssessment>;
  createInterpretation(current: KnowledgeVersion, change: ChangeAssessment): Promise<string>;
  mapRequirements(interpretationId: string): Promise<string[]>;
  emitChangeEvent(current: KnowledgeVersion, change: ChangeAssessment): Promise<void>;
}

export async function processKnowledgeVersion(
  deps: RegulatoryDependencies,
  previous: KnowledgeVersion | null,
  current: KnowledgeVersion,
): Promise<{
  interpretationId: string;
  requirementIds: string[];
  reviewRequired: boolean;
}> {
  const change = await deps.compare(previous, current);

  const interpretationId = await deps.createInterpretation(current, change);
  const requirementIds = await deps.mapRequirements(interpretationId);

  await deps.emitChangeEvent(current, change);

  return {
    interpretationId,
    requirementIds,
    reviewRequired: change.requiresHumanReview,
  };
}
