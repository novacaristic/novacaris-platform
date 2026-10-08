import { createHash } from "node:crypto";

export interface LedgerEvent {
  tenantId: string;
  sequenceNo: number;
  eventType: string;
  actorType: string;
  actorId?: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export function canonicalize(event: LedgerEvent, previousHash: string): string {
  return JSON.stringify({
    tenantId: event.tenantId,
    sequenceNo: event.sequenceNo,
    eventType: event.eventType,
    actorType: event.actorType,
    actorId: event.actorId ?? null,
    correlationId: event.correlationId,
    payload: event.payload,
    previousHash,
  });
}

export function hashLedgerEvent(event: LedgerEvent, previousHash: string): string {
  return createHash("sha256")
    .update(canonicalize(event, previousHash), "utf8")
    .digest("hex");
}

export function verifyLedgerChain(
  events: Array<LedgerEvent & { eventHash: string; previousEventHash?: string }>,
  genesisHash: string,
): { valid: boolean; failedSequence?: number } {
  let previous = genesisHash;

  for (const event of events) {
    if ((event.previousEventHash ?? genesisHash) !== previous) {
      return { valid: false, failedSequence: event.sequenceNo };
    }

    const expected = hashLedgerEvent(event, previous);

    if (expected !== event.eventHash) {
      return { valid: false, failedSequence: event.sequenceNo };
    }

    previous = event.eventHash;
  }

  return { valid: true };
}
