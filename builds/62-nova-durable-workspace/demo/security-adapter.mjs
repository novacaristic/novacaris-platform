// LOCAL DEMONSTRATION ONLY. Do not use this adapter in a shared or production environment.
const tenantId = "62000000-0000-4000-8000-000000000001";
const roles = new Map([["clinician-demo","clinician"],["supervisor-demo","supervisor"],["admin-demo","administrator"]]);
export async function resolveContext(request) {
  const actor = request.headers?.["x-demo-actor"] || "clinician-demo";
  return { contractVersion:"1.0", requestId:crypto.randomUUID(), correlationId:crypto.randomUUID(),
    tenantId, actor:{type:"user",reference:actor}, authorizationDecisionReference:"local-demo-authorization" };
}
export async function resolveWorkspaceContext(request) {
  const actor = request.headers?.["x-demo-actor"] || "clinician-demo";
  const role = roles.get(actor);
  if (!role) return null;
  return { tenantId, actor:{type:"user",reference:actor,role}, authorizationDecisionReference:"local-demo-authorization" };
}
export async function authorize(_context, _action) { return true; }
