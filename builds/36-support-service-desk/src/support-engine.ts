export type TicketStatus =
  | "new"
  | "triaged"
  | "assigned"
  | "in_progress"
  | "waiting_customer"
  | "waiting_third_party"
  | "resolved"
  | "closed"
  | "reopened";

export interface TicketContext {
  tenantId: string;
  ticketId: string;
  status: TicketStatus;
  requiredResolutionReference?: string;
}

export interface SupportDependencies {
  verifyTenantScope(context: TicketContext): Promise<boolean>;
  verifyResolution(context: TicketContext): Promise<boolean>;
  recordEvent(type: string, details: Record<string, unknown>): Promise<void>;
  closeTicket(ticketId: string): Promise<void>;
}

export async function closeResolvedTicket(
  deps: SupportDependencies,
  context: TicketContext,
): Promise<{ closed: boolean; reason?: string }> {
  if (!context.tenantId || !context.ticketId) {
    return { closed: false, reason: "TICKET_CONTEXT_REQUIRED" };
  }

  if (!(await deps.verifyTenantScope(context))) {
    await deps.recordEvent("support.ticket.close_blocked", {
      ticketId: context.ticketId,
      reason: "TENANT_SCOPE_DENIED",
    });
    return { closed: false, reason: "TENANT_SCOPE_DENIED" };
  }

  if (context.status !== "resolved") {
    return { closed: false, reason: "TICKET_NOT_RESOLVED" };
  }

  if (!context.requiredResolutionReference) {
    return { closed: false, reason: "RESOLUTION_REFERENCE_REQUIRED" };
  }

  if (!(await deps.verifyResolution(context))) {
    return { closed: false, reason: "RESOLUTION_NOT_VERIFIED" };
  }

  await deps.closeTicket(context.ticketId);
  await deps.recordEvent("support.ticket.closed", {
    ticketId: context.ticketId,
    resolutionReference: context.requiredResolutionReference,
  });

  return { closed: true };
}

export function shouldEscalate(
  elapsedMinutes: number,
  targetMinutes: number,
  alreadyEscalated: boolean,
): boolean {
  return !alreadyEscalated && elapsedMinutes >= targetMinutes;
}
