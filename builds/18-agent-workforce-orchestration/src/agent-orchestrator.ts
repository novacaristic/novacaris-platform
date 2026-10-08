export interface Agent {
  id: string;
  key: string;
  status: "active" | "disabled";
}

export interface AgentTask {
  id: string;
  objective: string;
  targetAgent: string;
}

export interface OrchestratorDependencies {
  resolveAgent(agentKey: string): Promise<Agent | null>;
  createTask(agent: Agent, objective: string): Promise<string>;
  recordHandoff(source: Agent, target: Agent, taskId: string, reason: string): Promise<void>;
}

export async function routeTask(
  deps: OrchestratorDependencies,
  source: Agent,
  targetAgentKey: string,
  objective: string,
): Promise<{ taskId: string; target: Agent }> {
  const target = await deps.resolveAgent(targetAgentKey);

  if (!target || target.status !== "active") {
    throw new Error("TARGET_AGENT_UNAVAILABLE");
  }

  const taskId = await deps.createTask(target, objective);
  await deps.recordHandoff(source, target, taskId, "specialist routing");

  return { taskId, target };
}
