export type DocumentStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "signed"
  | "finalized"
  | "superseded";

export interface DocumentContext {
  tenantId: string;
  documentId: string;
  status: DocumentStatus;
}

export interface DocumentDependencies {
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  validateRequiredFields(documentId: string): Promise<string[]>;
  requireApproval(documentId: string): Promise<boolean>;
  finalize(documentId: string): Promise<void>;
}

export async function prepareForFinalization(
  deps: DocumentDependencies,
  context: DocumentContext,
): Promise<{ ready: boolean; blockers: string[] }> {
  if (!context.tenantId || !context.documentId) {
    throw new Error("DOCUMENT_CONTEXT_REQUIRED");
  }

  if (context.status !== "approved") {
    return {
      ready: false,
      blockers: ["DOCUMENT_NOT_APPROVED"],
    };
  }

  const missingFields = await deps.validateRequiredFields(context.documentId);

  if (missingFields.length > 0) {
    await deps.recordEvent("document.finalization.blocked", {
      documentId: context.documentId,
      missingFields,
    });

    return {
      ready: false,
      blockers: missingFields,
    };
  }

  const approvalSatisfied = await deps.requireApproval(context.documentId);

  if (!approvalSatisfied) {
    return {
      ready: false,
      blockers: ["REQUIRED_APPROVAL_MISSING"],
    };
  }

  return { ready: true, blockers: [] };
}

export async function finalizeDocument(
  deps: DocumentDependencies,
  context: DocumentContext,
): Promise<void> {
  const result = await prepareForFinalization(deps, context);

  if (!result.ready) {
    throw new Error("DOCUMENT_NOT_READY_FOR_FINALIZATION");
  }

  await deps.finalize(context.documentId);

  await deps.recordEvent("document.finalized", {
    documentId: context.documentId,
  });
}
