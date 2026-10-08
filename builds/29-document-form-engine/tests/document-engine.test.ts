import { describe, expect, it } from "vitest";
import {
  prepareForFinalization,
  finalizeDocument,
} from "../src/document-engine";

describe("Build 29 document engine", () => {
  it("blocks finalization when the document is not approved", async () => {
    const result = await prepareForFinalization(
      {
        recordEvent: async () => {},
        validateRequiredFields: async () => [],
        requireApproval: async () => true,
        finalize: async () => {},
      },
      {
        tenantId: "tenant-1",
        documentId: "doc-1",
        status: "in_review",
      },
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("DOCUMENT_NOT_APPROVED");
  });

  it("blocks finalization when required fields are missing", async () => {
    const result = await prepareForFinalization(
      {
        recordEvent: async () => {},
        validateRequiredFields: async () => ["license_number"],
        requireApproval: async () => true,
        finalize: async () => {},
      },
      {
        tenantId: "tenant-1",
        documentId: "doc-1",
        status: "approved",
      },
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("license_number");
  });

  it("finalizes only after approval and validation", async () => {
    let finalized = false;

    await finalizeDocument(
      {
        recordEvent: async () => {},
        validateRequiredFields: async () => [],
        requireApproval: async () => true,
        finalize: async () => {
          finalized = true;
        },
      },
      {
        tenantId: "tenant-1",
        documentId: "doc-1",
        status: "approved",
      },
    );

    expect(finalized).toBe(true);
  });
});
