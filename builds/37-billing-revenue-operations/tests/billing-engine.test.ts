import { describe, expect, it } from "vitest";
import { calculateAmountDue, processPaymentEvent } from "../src/billing-engine";

describe("Build 37 billing engine", () => {
  it("calculates amount due after payments and approved credits", () => {
    expect(calculateAmountDue(120, 50, 20)).toBe(50);
    expect(calculateAmountDue(100, 100, 0)).toBe(0);
  });

  it("rejects unverified provider events", async () => {
    const result = await processPaymentEvent(
      {
        eventAlreadyProcessed: async () => false,
        recordProviderEvent: async () => {},
        updateInvoiceFromVerifiedEvent: async () => {},
        recordAuditEvent: async () => {},
      },
      {
        provider: "provider-test",
        providerEventReference: "evt-1",
        type: "payment_succeeded",
        signatureVerified: false,
      },
    );

    expect(result.processed).toBe(false);
    expect(result.reason).toBe("SIGNATURE_NOT_VERIFIED");
  });

  it("does not reprocess duplicate provider events", async () => {
    const result = await processPaymentEvent(
      {
        eventAlreadyProcessed: async () => true,
        recordProviderEvent: async () => {},
        updateInvoiceFromVerifiedEvent: async () => {},
        recordAuditEvent: async () => {},
      },
      {
        provider: "provider-test",
        providerEventReference: "evt-1",
        type: "payment_succeeded",
        signatureVerified: true,
      },
    );

    expect(result.processed).toBe(false);
    expect(result.reason).toBe("DUPLICATE_EVENT");
  });

  it("processes a verified unique provider event", async () => {
    let updated = false;
    const result = await processPaymentEvent(
      {
        eventAlreadyProcessed: async () => false,
        recordProviderEvent: async () => {},
        updateInvoiceFromVerifiedEvent: async () => {
          updated = true;
        },
        recordAuditEvent: async () => {},
      },
      {
        provider: "provider-test",
        providerEventReference: "evt-2",
        type: "payment_succeeded",
        amount: 49,
        currency: "USD",
        signatureVerified: true,
      },
    );

    expect(result.processed).toBe(true);
    expect(updated).toBe(true);
  });
});
