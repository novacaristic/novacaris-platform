export type PaymentEventType =
  | "payment_succeeded"
  | "payment_failed"
  | "payment_refunded"
  | "invoice_voided";

export interface PaymentEvent {
  provider: string;
  providerEventReference: string;
  type: PaymentEventType;
  amount?: number;
  currency?: string;
  signatureVerified: boolean;
}

export interface BillingDependencies {
  eventAlreadyProcessed(provider: string, eventReference: string): Promise<boolean>;
  recordProviderEvent(event: PaymentEvent): Promise<void>;
  updateInvoiceFromVerifiedEvent(event: PaymentEvent): Promise<void>;
  recordAuditEvent(type: string, details: Record<string, unknown>): Promise<void>;
}

export async function processPaymentEvent(
  deps: BillingDependencies,
  event: PaymentEvent,
): Promise<{ processed: boolean; reason?: string }> {
  if (!event.provider || !event.providerEventReference) {
    return { processed: false, reason: "PROVIDER_EVENT_REFERENCE_REQUIRED" };
  }

  if (!event.signatureVerified) {
    await deps.recordAuditEvent("billing.provider_event.rejected", {
      provider: event.provider,
      providerEventReference: event.providerEventReference,
      reason: "SIGNATURE_NOT_VERIFIED",
    });
    return { processed: false, reason: "SIGNATURE_NOT_VERIFIED" };
  }

  if (await deps.eventAlreadyProcessed(event.provider, event.providerEventReference)) {
    return { processed: false, reason: "DUPLICATE_EVENT" };
  }

  await deps.recordProviderEvent(event);
  await deps.updateInvoiceFromVerifiedEvent(event);
  await deps.recordAuditEvent("billing.provider_event.processed", {
    provider: event.provider,
    providerEventReference: event.providerEventReference,
    type: event.type,
  });

  return { processed: true };
}

export function calculateAmountDue(
  totalAmount: number,
  amountPaid: number,
  approvedCredits: number,
): number {
  if (
    !Number.isFinite(totalAmount) ||
    !Number.isFinite(amountPaid) ||
    !Number.isFinite(approvedCredits) ||
    totalAmount < 0 ||
    amountPaid < 0 ||
    approvedCredits < 0
  ) {
    throw new Error("INVALID_BILLING_AMOUNT");
  }

  return Math.max(0, totalAmount - amountPaid - approvedCredits);
}
