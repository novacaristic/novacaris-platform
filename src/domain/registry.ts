import type { AgentDefinition, Permission } from "./agents.js";
import { canAct } from "./agents.js";

export interface AgentRegistryEntry {
  agent: AgentDefinition;
  active: boolean;
  registeredAt: string;
  updatedAt: string;
}

export class AgentRegistry {
  private readonly agents = new Map<string, AgentRegistryEntry>();
  private readonly permissions = new Map<string, Permission>();

  register(agent: AgentDefinition, now = new Date()): AgentRegistryEntry {
    const existing = this.agents.get(agent.id);
    const entry: AgentRegistryEntry = {
      agent,
      active: existing?.active ?? true,
      registeredAt: existing?.registeredAt ?? now.toISOString(),
      updatedAt: now.toISOString()
    };
    this.agents.set(agent.id, entry);
    return entry;
  }

  deactivate(agentId: string, now = new Date()): void {
    const entry = this.agents.get(agentId);
    if (!entry) throw new Error(`Agent not found: ${agentId}`);
    this.agents.set(agentId, { ...entry, active: false, updatedAt: now.toISOString() });
  }

  get(agentId: string): AgentRegistryEntry | undefined {
    return this.agents.get(agentId);
  }

  grant(permission: Permission): Permission {
    const agent = this.agents.get(permission.agentId);
    if (!agent || !agent.active) throw new Error("Cannot grant permission to an inactive or unknown agent");
    this.permissions.set(permission.id, permission);
    return permission;
  }

  getPermission(permissionId: string): Permission | undefined {
    return this.permissions.get(permissionId);
  }

  authorize(agentId: string, permissionId: string, action: Permission["actions"][number], now = new Date()) {
    const entry = this.agents.get(agentId);
    const permission = this.permissions.get(permissionId);
    if (!entry || !entry.active) return { allowed: false, requiresApproval: false, reason: "Agent is inactive or unknown" };
    if (!permission) return { allowed: false, requiresApproval: false, reason: "Permission not found" };
    return canAct(entry.agent, permission, action, now);
  }
}
