import type { CustomerDashboard, CustomerWorkspace } from "../portal/customer-portal.js";
import { buildCustomerDashboard } from "../portal/customer-portal.js";
import type { SessionContext } from "./workspace.js";
import type { WorkspaceRepository } from "./workspace-repository.js";

export async function getWorkspaceDashboard(session: SessionContext, repository: WorkspaceRepository): Promise<CustomerDashboard> {
 const workspace = await repository.getWorkspace(session);
 if (!workspace) throw new Error("Workspace not found.");
 if (workspace.organizationId !== session.organizationId) throw new Error("Organization scope mismatch.");
 return buildCustomerDashboard(workspace as CustomerWorkspace);
}

export async function getAssessmentHistory(session: SessionContext, repository: WorkspaceRepository) {
 return repository.listAssessments(session);
}