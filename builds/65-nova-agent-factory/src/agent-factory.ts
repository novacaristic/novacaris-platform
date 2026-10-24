export type AgentRisk = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type AgentLifecycle = "REQUESTED" | "SPECIFIED" | "BUILDING" | "TESTING" | "APPROVAL_REQUIRED" | "APPROVED" | "REGISTERED" | "ACTIVE" | "SUSPENDED" | "FAILED" | "RETIRED";
export type AgentCapability = "crm.read" | "crm.draft" | "crm.write" | "marketing.research" | "marketing.draft" | "marketing.publish" | "finance.analyze" | "finance.forecast" | "finance.payment.prepare" | "research.web" | "research.documents" | "research.due_diligence" | "operations.plan" | "operations.execute" | "compliance.assess" | "evidence.read" | "evidence.write" | "funding.discover" | "security.assess" | "agent.create";
export type AgentAction = "READ" | "RECOMMEND" | "PREPARE" | "EXECUTE_WITH_APPROVAL" | "AUTONOMOUS";
export type AgentDomain = "SALES" | "MARKETING" | "FINANCE" | "RESEARCH" | "OPERATIONS" | "COMPLIANCE" | "FUNDING" | "SECURITY" | "CUSTOM";

export interface AgentProfile {
  id: string; name: string; purpose: string; domain: AgentDomain; risk: AgentRisk;
  capabilities: AgentCapability[]; defaultActionCeiling: AgentAction;
  requiresHumanApprovalForActivation: boolean; description: string;
}
export interface AgentCreateCommand {
  requestId: string; tenantId: string; requesterId: string; requestedName: string; purpose: string;
  domain: AgentDomain; requestedCapabilities: AgentCapability[]; requestedRisk: AgentRisk;
  requestedActionCeiling: AgentAction; createdAt: string;
}
export interface AgentRecord {
  id: string; tenantId: string; profile: AgentProfile; lifecycle: AgentLifecycle; requestedBy: string;
  approvedBy?: string; createdAt: string; updatedAt: string; version: number;
}
export interface FactoryPolicy {
  allowedCapabilities: AgentCapability[]; maxActiveAgentsPerTenant: number;
  maxRiskWithoutHumanApproval: AgentRisk; requireApprovalForActivation: boolean;
  allowAutonomousAgentCreation: boolean;
}
export interface FactoryEvent {
  id: string; tenantId: string; actorId: string; agentId: string; event: string;
  occurredAt: string; details: Record<string, string>;
}
export interface AgentFactoryStore {
  findByName(tenantId: string, normalizedName: string): Promise<AgentRecord | undefined>;
  countActive(tenantId: string): Promise<number>;
  insert(record: AgentRecord): Promise<void>;
  get(tenantId: string, agentId: string): Promise<AgentRecord | undefined>;
  replace(record: AgentRecord, expectedVersion: number): Promise<void>;
  appendEvent(event: FactoryEvent): Promise<void>;
}
const riskRank: Record<AgentRisk, number> = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
const actionRank: Record<AgentAction, number> = { READ: 0, RECOMMEND: 1, PREPARE: 2, EXECUTE_WITH_APPROVAL: 3, AUTONOMOUS: 4 };
const transitions: Record<AgentLifecycle, AgentLifecycle[]> = {
  REQUESTED: ["SPECIFIED", "FAILED"], SPECIFIED: ["BUILDING", "APPROVAL_REQUIRED", "FAILED"],
  BUILDING: ["TESTING", "FAILED"], TESTING: ["APPROVAL_REQUIRED", "REGISTERED", "FAILED"],
  APPROVAL_REQUIRED: ["APPROVED", "FAILED"], APPROVED: ["REGISTERED", "FAILED"],
  REGISTERED: ["ACTIVE", "SUSPENDED", "RETIRED"], ACTIVE: ["SUSPENDED", "RETIRED"],
  SUSPENDED: ["ACTIVE", "RETIRED"], FAILED: ["RETIRED"], RETIRED: []
};
const newId = (prefix: string) => prefix + "_" + crypto.randomUUID();
const normalize = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
function requireText(value: string, field: string, max = 2000) {
  if (!value || !value.trim() || value.length > max) throw new Error("INVALID_" + field.toUpperCase());
}

export class AgentFactory {
  constructor(private readonly store: AgentFactoryStore, private readonly policy: FactoryPolicy) {}
  async requestCreation(command: AgentCreateCommand, now = new Date()): Promise<AgentRecord> {
    requireText(command.tenantId, "tenant_id", 200);
    requireText(command.requesterId, "requester_id", 200);
    requireText(command.requestedName, "agent_name", 120);
    requireText(command.purpose, "purpose");
    if (!command.requestedCapabilities.length) throw new Error("AGENT_CAPABILITIES_REQUIRED");
    if (command.requestedCapabilities.some(c => !this.policy.allowedCapabilities.includes(c))) throw new Error("CAPABILITY_NOT_ALLOWED");
    if (actionRank[command.requestedActionCeiling] > actionRank.PREPARE && !this.policy.allowAutonomousAgentCreation) throw new Error("AUTONOMOUS_CREATION_POLICY_DENIED");
    if (await this.store.findByName(command.tenantId, normalize(command.requestedName))) throw new Error("AGENT_NAME_ALREADY_EXISTS");
    if (await this.store.countActive(command.tenantId) >= this.policy.maxActiveAgentsPerTenant) throw new Error("TENANT_AGENT_LIMIT_REACHED");
    const approval = this.policy.requireApprovalForActivation ||
      riskRank[command.requestedRisk] > riskRank[this.policy.maxRiskWithoutHumanApproval] ||
      command.requestedActionCeiling === "EXECUTE_WITH_APPROVAL" || command.requestedActionCeiling === "AUTONOMOUS";
    const profile: AgentProfile = {
      id: newId("profile"), name: command.requestedName.trim(), purpose: command.purpose.trim(),
      domain: command.domain, risk: command.requestedRisk, capabilities: [...new Set(command.requestedCapabilities)],
      defaultActionCeiling: command.requestedActionCeiling, requiresHumanApprovalForActivation: approval,
      description: "Owner-requested agent. Inactive until approved, registered, and activated."
    };
    const record: AgentRecord = {
      id: newId("agent"), tenantId: command.tenantId, profile,
      lifecycle: "SPECIFIED", requestedBy: command.requesterId,
      createdAt: now.toISOString(), updatedAt: now.toISOString(), version: 1
    };
    await this.store.insert(record);
    await this.store.appendEvent({
      id: newId("event"), tenantId: command.tenantId, actorId: command.requesterId, agentId: record.id,
      event: "AGENT_CREATION_REQUESTED", occurredAt: now.toISOString(),
      details: { requestId: command.requestId, domain: command.domain, approvalRequired: String(approval) }
    });
    return record;
  }
  async transition(tenantId: string, agentId: string, next: AgentLifecycle, actorId: string, reason: string, now = new Date()): Promise<AgentRecord> {
    requireText(actorId, "actor_id", 200); requireText(reason, "reason", 1000);
    const current = await this.store.get(tenantId, agentId);
    if (!current) throw new Error("AGENT_NOT_FOUND");
    if (!transitions[current.lifecycle].includes(next)) throw new Error("AGENT_LIFECYCLE_TRANSITION_DENIED");
    if (next === "APPROVED") {
      if (actorId === current.requestedBy) throw new Error("SELF_APPROVAL_DENIED");
      if (current.lifecycle !== "APPROVAL_REQUIRED") throw new Error("AGENT_NOT_AWAITING_APPROVAL");
    }
    if (next === "ACTIVE") {
      if (current.lifecycle !== "REGISTERED" && current.lifecycle !== "SUSPENDED") throw new Error("AGENT_MUST_BE_REGISTERED");
      if (current.profile.requiresHumanApprovalForActivation && !current.approvedBy) throw new Error("HUMAN_APPROVAL_REQUIRED");
      if (current.lifecycle !== "ACTIVE" && await this.store.countActive(tenantId) >= this.policy.maxActiveAgentsPerTenant) throw new Error("TENANT_AGENT_LIMIT_REACHED");
    }
    const updated: AgentRecord = { ...current, lifecycle: next, approvedBy: next === "APPROVED" ? actorId : current.approvedBy, updatedAt: now.toISOString(), version: current.version + 1 };
    await this.store.replace(updated, current.version);
    await this.store.appendEvent({
      id: newId("event"), tenantId, actorId, agentId, event: "AGENT_" + next, occurredAt: now.toISOString(),
      details: { previous: current.lifecycle, next, reason }
    });
    return updated;
  }
}
export const defaultFactoryPolicy: FactoryPolicy = {
  allowedCapabilities: ["crm.read","crm.draft","crm.write","marketing.research","marketing.draft","marketing.publish","finance.analyze","finance.forecast","finance.payment.prepare","research.web","research.documents","research.due_diligence","operations.plan","operations.execute","compliance.assess","evidence.read","evidence.write","funding.discover","security.assess","agent.create"],
  maxActiveAgentsPerTenant: 25, maxRiskWithoutHumanApproval: "MODERATE",
  requireApprovalForActivation: true, allowAutonomousAgentCreation: false
};
