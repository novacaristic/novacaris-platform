import { describe, expect, it } from "vitest";
import {
  ClientCaseWorkspace,
  type WorkspaceContext,
  type WorkspaceNote,
  type WorkspaceAuditEvent,
  type WorkspaceStore,
} from "../src/client-case-workspace";

class MemoryStore implements WorkspaceStore {
  cases = new Map<string, { id: string; tenantId: string; status: "active" | "closed" }>();
  notes = new Map<string, WorkspaceNote>();
  events: WorkspaceAuditEvent[] = [];
  async getCase(tenantId: string, id: string) {
    const item = this.cases.get(id);
    return item?.tenantId === tenantId ? item : null;
  }
  async getNote(tenantId: string, id: string) {
    const item = this.notes.get(id);
    return item?.tenantId === tenantId ? structuredClone(item) : null;
  }
  async saveNote(note: WorkspaceNote) { this.notes.set(note.id, structuredClone(note)); }
  async appendAudit(event: WorkspaceAuditEvent) { this.events.push(structuredClone(event)); }
}
const content = {
  situation: "Client requested help organizing daily routines.",
  intervention: "Practiced a simple morning checklist and reviewed barriers.",
  response: "Client participated and identified one achievable next step.",
  plan: "Review checklist use at next visit and revise if needed.",
};
const ctx = (
  tenantId = "tenant-a",
  actor = "clinician-1",
  role: WorkspaceContext["actor"]["role"] = "clinician",
): WorkspaceContext => ({
  tenantId,
  actor: { type: "user", reference: actor, role },
  authorizationDecisionReference: "policy-decision-123",
});
function setup(allow = true) {
  const store = new MemoryStore();
  store.cases.set("case-1", { id: "case-1", tenantId: "tenant-a", status: "active" });
  let count = 0;
  const engine = new ClientCaseWorkspace(
    store,
    async () => allow,
    () => new Date("2026-10-09T12:00:00.000Z"),
    () => "id-" + (++count),
  );
  return { store, engine };
}
async function draft(engine: ClientCaseWorkspace, context = ctx(), body = content) {
  return engine.createDraft(context, { caseId: "case-1", content: body, source: "ai_assisted" });
}

describe("Build 61 client/case workspace", () => {
  it("creates draft and audit evidence", async () => {
    const { store, engine } = setup();
    const note = await draft(engine);
    expect(note.status).toBe("draft");
    expect(note.source).toBe("ai_assisted");
    expect(note.complianceBlockers).toEqual([]);
    expect(store.events.map(event => event.action)).toEqual(["draft_created"]);
  });

  it("blocks incomplete sections", async () => {
    const { engine } = setup();
    const note = await draft(engine, ctx(), { ...content, intervention: "short" });
    await expect(engine.submitForReview(ctx(), note.id)).rejects.toThrow("COMPLIANCE_BLOCKED");
  });

  it("enforces tenant isolation", async () => {
    const { engine } = setup();
    await expect(draft(engine, ctx("tenant-b"))).rejects.toThrow("CASE_NOT_FOUND");
    const note = await draft(engine);
    await expect(engine.checkCompliance(ctx("tenant-b"), note.id)).rejects.toThrow("NOTE_NOT_FOUND");
  });

  it("fails closed when policy denies", async () => {
    const { engine } = setup(false);
    await expect(draft(engine)).rejects.toThrow("POLICY_DENIED");
  });

  it("requires human actor", async () => {
    const { engine } = setup();
    const context = ctx();
    context.actor.type = "agent";
    await expect(draft(engine, context)).rejects.toThrow("HUMAN_ACTOR_REQUIRED");
  });

  it("requires supervisor and prevents self-approval", async () => {
    const { engine } = setup();
    const note = await draft(engine);
    await engine.submitForReview(ctx(), note.id);
    await expect(engine.review(ctx("tenant-a", "clinician-1", "supervisor"), {
      noteId: note.id, decision: "approve", note: "Reviewed.",
    })).rejects.toThrow("SELF_APPROVAL_FORBIDDEN");
    await expect(engine.review(ctx("tenant-a", "supervisor-2", "clinician"), {
      noteId: note.id, decision: "approve", note: "Reviewed.",
    })).rejects.toThrow("SUPERVISOR_ROLE_REQUIRED");
  });

  it("submits for independent supervisor approval and audits transitions", async () => {
    const { store, engine } = setup();
    const note = await draft(engine);
    expect((await engine.submitForReview(ctx(), note.id)).status).toBe("submitted_for_review");
    const approved = await engine.review(ctx("tenant-a", "supervisor-2", "supervisor"), {
      noteId: note.id, decision: "approve", note: "Content reviewed and approved.",
    });
    expect(approved.status).toBe("approved");
    expect(approved.reviewerReference).toBe("supervisor-2");
    expect(store.events.map(event => event.action)).toEqual(["draft_created", "submitted_for_review", "approved"]);
  });

  it("requires rationale and blocks invalid state transitions", async () => {
    const { engine } = setup();
    const note = await draft(engine);
    await engine.submitForReview(ctx(), note.id);
    await expect(engine.review(ctx("tenant-a", "supervisor-2", "supervisor"), {
      noteId: note.id, decision: "request_changes", note: " ",
    })).rejects.toThrow("REVIEW_NOTE_REQUIRED");
    await engine.review(ctx("tenant-a", "supervisor-2", "supervisor"), {
      noteId: note.id, decision: "request_changes", note: "Clarify the follow-up plan.",
    });
    await expect(engine.review(ctx("tenant-a", "supervisor-3", "supervisor"), {
      noteId: note.id, decision: "approve", note: "Late approval.",
    })).rejects.toThrow("NOTE_NOT_AWAITING_REVIEW");
  });
});
