import { describe, expect, it } from "vitest";
import { hashLedgerEvent, verifyLedgerChain } from "../src/trust-ledger";

describe("Build 20 trust ledger", () => {
  it("builds and verifies a hash chain", () => {
    const genesis = "GENESIS";

    const first = {
      tenantId: "tenant-1",
      sequenceNo: 1,
      eventType: "DECISION_REQUESTED",
      actorType: "user",
      actorId: "user-1",
      correlationId: "corr-1",
      payload: { requestId: "req-1" },
    };

    const firstHash = hashLedgerEvent(first, genesis);

    const second = {
      tenantId: "tenant-1",
      sequenceNo: 2,
      eventType: "DECISION_APPROVED",
      actorType: "user",
      actorId: "user-1",
      correlationId: "corr-1",
      payload: { requestId: "req-1" },
    };

    const secondHash = hashLedgerEvent(second, firstHash);

    const result = verifyLedgerChain(
      [
        { ...first, eventHash: firstHash, previousEventHash: genesis },
        { ...second, eventHash: secondHash, previousEventHash: firstHash },
      ],
      genesis,
    );

    expect(result.valid).toBe(true);
  });

  it("detects a tampered event", () => {
    const genesis = "GENESIS";

    const event = {
      tenantId: "tenant-1",
      sequenceNo: 1,
      eventType: "EVIDENCE_VERIFIED",
      actorType: "system",
      correlationId: "corr-2",
      payload: { evidenceId: "e-1" },
    };

    const hash = hashLedgerEvent(event, genesis);

    const result = verifyLedgerChain(
      [{ ...event, eventHash: "tampered", previousEventHash: genesis }],
      genesis,
    );

    expect(result.valid).toBe(false);
    expect(result.failedSequence).toBe(1);
    void hash;
  });
});
