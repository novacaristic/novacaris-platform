import type { AssessmentRequest, AssessmentResponse, ApplicationHealth } from "./contracts.js";
import type { AuthenticatedSession } from "./identity.js";
import type { AssessmentRunContext } from "./assessment-service.js";
import { runWorkspaceAssessment, reassessAfterEvidenceChange } from "./assessment-service.js";
import type { WorkspaceRepository } from "./workspace-repository.js";
import type { EvidenceRepository } from "./evidence-service.js";
import { getWorkspaceDashboard, getAssessmentHistory } from "./portal-service.js";
import { syncActionsFromAssessment, type ActionRepository, updateAction, type ActionRecord } from "./action-engine.js";
import { assertOrganizationScope, requireRole } from "./identity.js";

export interface HttpRequest<T = unknown> {
  method: "GET" | "POST" | "PATCH";
  path: string;
  session?: AuthenticatedSession;
  body?: T;
}
export interface HttpResponse<T = unknown> { status: number; body: T; }

export interface ApplicationDependencies {
  workspaceRepository: WorkspaceRepository;
  evidenceRepository: EvidenceRepository;
  actionRepository: ActionRepository;
  assessmentContext: AssessmentRunContext;
  version: string;
}

function ok<T>(body: T): HttpResponse<T> { return { status: 200, body }; }
function created<T>(body: T): HttpResponse<T> { return { status: 201, body }; }
function bad(message: string): HttpResponse<{ error: string }> { return { status: 400, body: { error: message } }; }
function unauthorized(message = "Authentication required."): HttpResponse<{ error: string }> { return { status: 401, body: { error: message } }; }
function forbidden(message = "Insufficient workspace authorization."): HttpResponse<{ error: string }> { return { status: 403, body: { error: message } }; }

function requireSession(request: HttpRequest): AuthenticatedSession | HttpResponse<{ error: string }> {
  return request.session ?? unauthorized();
}

export async function handleApplicationRequest(
  request: HttpRequest,
  deps: ApplicationDependencies,
): Promise<HttpResponse> {
  if (request.method === "GET" && request.path === "/api/health") {
    const body: ApplicationHealth = { ok: true, service: "novacaris-application", version: deps.version };
    return ok(body);
  }

  const sessionOrResponse = requireSession(request);
  if ("status" in sessionOrResponse) return sessionOrResponse;
  const session = sessionOrResponse;

  try {
    if (request.method === "GET" && request.path === "/api/workspace") {
      return ok(await getWorkspaceDashboard(session, deps.workspaceRepository));
    }

    if (request.method === "GET" && request.path === "/api/assessments") {
      return ok(await getAssessmentHistory(session, deps.workspaceRepository));
    }

    if (request.method === "POST" && request.path === "/api/assessments") {
      requireRole(session, "OWNER", "ADMIN", "COMPLIANCE", "OPERATIONS");
      const body = request.body as AssessmentRequest | undefined;
      if (!body) return bad("Assessment request body is required.");
      assertOrganizationScope(session, body.provider.intake.organizationId);
      const result = await runWorkspaceAssessment(
        session, { ...deps.assessmentContext, ...body },
        deps.workspaceRepository, deps.evidenceRepository, body.provider,
      );
      await syncActionsFromAssessment(session, result.package.assessment, deps.actionRepository);
      return ok(result satisfies AssessmentResponse);
    }

    if (request.method === "POST" && request.path === "/api/evidence") {
      requireRole(session, "OWNER", "ADMIN", "COMPLIANCE", "OPERATIONS", "CLINICAL");
      const body = request.body as { id?: string; kind?: string; payload?: unknown } | undefined;
      if (!body?.id || !body.kind || body.payload === undefined) return bad("Evidence id, kind, and payload are required.");
      const result = await reassessAfterEvidenceChange(
        session, { id: body.id, kind: body.kind, payload: body.payload },
        deps.assessmentContext, deps.workspaceRepository, deps.evidenceRepository,
      );
      await syncActionsFromAssessment(session, result.package.assessment, deps.actionRepository);
      return created(result);
    }

    if (request.method === "PATCH" && request.path.startsWith("/api/actions/")) {
      requireRole(session, "OWNER", "ADMIN", "COMPLIANCE", "OPERATIONS");
      const actionId = request.path.slice("/api/actions/".length);
      const actions = await deps.actionRepository.listActions(session);
      const action = actions.find((item) => item.id === actionId);
      if (!action) return bad("Action not found.");
      const patch = request.body as Pick<ActionRecord, "status" | "ownerRole" | "dueAt" | "evidenceIds" | "verificationNote"> | undefined;
      if (!patch) return bad("Action update body is required.");
      return ok(updateAction(session, action, patch));
    }

    return { status: 404, body: { error: "Route not found." } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Application request failed.";
    if (message.includes("Insufficient")) return forbidden(message);
    return bad(message);
  }
}
