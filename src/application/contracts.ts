export interface ApplicationHealth { ok: true; service: string; version: string; }

export interface AssessmentRoute { method: "POST"; path: "/api/assessments"; purpose: "run-nova-assessment"; }

export const APPLICATION_ROUTES: AssessmentRoute[] = [
  { method: "POST", path: "/api/assessments", purpose: "run-nova-assessment" },
];
