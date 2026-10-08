import { strict as assert } from "node:assert";
import { EvidenceLedger } from "../src/domain/ledger.ts";
import { DefaultHumanReviewCenter } from "../src/application/human-review.ts";

const session = {
  userId: "reviewer-a",
  organizationId: "org-a",
  roles: ["COMPLIANCE"],
  sessionId: "session-a",
} as const;

const ledger = new EvidenceLedger();
const request = ledger.requestAuthorization({
  id: "auth:org-a:1",
  agentId: "mr-nova",
  action: "EXECUTE_WITH_APPROVAL",
  subjectId: "org-a:action-1",
  evidenceIds: ["evidence-a"],
});

const center = new DefaultHumanReviewCenter();
const items = center.list(session, [], [request]);
assert.equal(items.length, 1);
assert.equal(items[0]?.requiresDecision, true);

const approved = center.decideAuthorization(session, ledger, request.id, {
  decision: "APPROVED",
  rationale: "Evidence reviewed and action is within the approved scope.",
});
assert.equal(approved.status, "APPROVED");
assert.equal(approved.approverId, "reviewer-a");
assert.equal(ledger.list().some((entry) => entry.eventType === "APPROVED"), true);

assert.throws(
  () => center.decideAuthorization(session, ledger, request.id, {
    decision: "REJECTED",
    rationale: "Second decision should fail.",
  }),
  /already APPROVED/,
);

console.log("Human Review authorization test passed.");
