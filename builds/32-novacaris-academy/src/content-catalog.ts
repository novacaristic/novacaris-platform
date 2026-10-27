export type ApprovalState = "draft" | "in_review" | "approved" | "retired";

export interface ContentItem {
  key: string;
  title: string;
  kind: string;
  level: number;
  file: string;
  owner: string;
  version: string;
  approvalState: ApprovalState;
  reviewer: string | null;
  reviewDate: string | null;
  jurisdiction: string[];
  requiresLegalReview: boolean;
  sourceRefs: string[];
  changeHistory: string[];
}

export interface ContentCatalog {
  schemaVersion: number;
  items: ContentItem[];
}

const FORBIDDEN_CLAIMS = [/guaranteed (job|placement|salary)/i, /accredited credential/i, /official anthropic/i];

/** Returns blocker codes; an empty list means the catalog is consistent with CONTENT_GOVERNANCE.md. */
export function validateContentCatalog(catalog: ContentCatalog, fileText: (file: string) => string | undefined): string[] {
  const blockers: string[] = [];
  const seen = new Set<string>();
  for (const item of catalog.items) {
    if (seen.has(item.key)) blockers.push(`DUPLICATE_KEY:${item.key}`);
    seen.add(item.key);
    if (!item.owner) blockers.push(`MISSING_OWNER:${item.key}`);
    if (!item.version) blockers.push(`MISSING_VERSION:${item.key}`);
    if (item.changeHistory.length === 0) blockers.push(`MISSING_CHANGE_HISTORY:${item.key}`);
    if (item.approvalState === "approved" && (!item.reviewer || !item.reviewDate)) {
      blockers.push(`APPROVED_WITHOUT_REVIEWER:${item.key}`);
    }
    const text = fileText(item.file);
    if (text === undefined) {
      blockers.push(`FILE_MISSING:${item.key}`);
      continue;
    }
    for (const pattern of FORBIDDEN_CLAIMS) {
      if (pattern.test(text)) blockers.push(`FORBIDDEN_CLAIM:${item.key}`);
    }
  }
  return blockers;
}

/** Only approved items may be published to learners. */
export function publishableItems(catalog: ContentCatalog): ContentItem[] {
  return catalog.items.filter((item) => item.approvalState === "approved");
}
