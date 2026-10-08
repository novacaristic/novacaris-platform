import { buildReadinessAssessment } from "../src/commercial/readiness.js";

const assessment = buildReadinessAssessment(
  {
    organizationId: "org-test",
    organizationName: "Test Provider",
    organizationType: "behavioral-health",
    jurisdictions: ["MD"],
    siteIds: ["site-1"],
    serviceIds: ["service-1"],
    payerPrograms: ["MEDICAID"],
    operatingStage: "OPERATING",
    primaryObjective: "readiness",
  },
  [{
    id: "finding-1",
    domain: "EVIDENCE",
    priority: "HIGH",
    status: "AMBER",
    title: "Evidence gap",
    description: "Test gap",
    evidenceIds: [],
    recommendedActions: ["Collect evidence"],
    humanReviewRequired: false,
  }],
);
if (assessment.overallScore !== 70) throw new Error(`Unexpected readiness score: ${assessment.overallScore}`);
if (assessment.overallStatus !== "AMBER") throw new Error(`Unexpected readiness status: ${assessment.overallStatus}`);
console.log("Readiness checks passed.");
