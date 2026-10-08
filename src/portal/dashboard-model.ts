import type { CustomerDashboard } from "./customer-portal.js";

export interface DashboardCard {
  id: string;
  label: string;
  value: string;
  detail: string;
  status: "POSITIVE" | "ATTENTION" | "REVIEW" | "NEUTRAL";
}

export interface DashboardViewModel {
  headline: string;
  subheadline: string;
  readinessCard: DashboardCard;
  cards: DashboardCard[];
  priorityFindings: CustomerDashboard["findings"];
  actionQueue: CustomerDashboard["actions"];
  academy: string[];
  consulting: string[];
  software: string[];
}

export function buildDashboardViewModel(
  dashboard: CustomerDashboard,
): DashboardViewModel {
  const readinessStatus =
    dashboard.readiness?.status ?? "NOT_ASSESSED";

  const readinessCard: DashboardCard = {
    id: "readiness",
    label: "Overall readiness",
    value: dashboard.readiness ? `${dashboard.readiness.score}/100` : "—",
    detail: dashboard.readiness
      ? `${readinessStatus} · Rule ${dashboard.readiness.ruleVersion}`
      : "Complete your intake to begin",
    status:
      readinessStatus === "GREEN"
        ? "POSITIVE"
        : readinessStatus === "HUMAN_REVIEW"
          ? "REVIEW"
          : dashboard.readiness
            ? "ATTENTION"
            : "NEUTRAL",
  };

  const highPriority = dashboard.findings.filter(
    (finding) => finding.priority === "CRITICAL" || finding.priority === "HIGH",
  ).length;

  const openActions = dashboard.actions.filter(
    (action) => action.status !== "COMPLETED",
  ).length;

  const evidenceGaps = dashboard.findings.filter(
    (finding) =>
      finding.domain === "EVIDENCE" &&
      finding.status !== "GREEN",
  ).length;

  return {
    headline: `Good morning — ${dashboard.organizationName}`,
    subheadline:
      "Mr. NOVA has organized your current readiness picture and highlighted what needs attention.",
    readinessCard,
    cards: [
      {
        id: "priority-findings",
        label: "Priority findings",
        value: String(highPriority),
        detail: highPriority ? "Critical or high-priority items" : "No high-priority findings",
        status: highPriority ? "ATTENTION" : "POSITIVE",
      },
      {
        id: "actions",
        label: "Open actions",
        value: String(openActions),
        detail: "Actions awaiting completion or review",
        status: openActions ? "ATTENTION" : "POSITIVE",
      },
      {
        id: "human-review",
        label: "Human review",
        value: String(dashboard.humanReviewCount),
        detail: "Items requiring qualified human attention",
        status: dashboard.humanReviewCount ? "REVIEW" : "POSITIVE",
      },
      {
        id: "evidence",
        label: "Evidence gaps",
        value: String(evidenceGaps),
        detail: "Evidence findings needing attention",
        status: evidenceGaps ? "ATTENTION" : "POSITIVE",
      },
    ],
    priorityFindings: dashboard.findings
      .filter(
        (finding) =>
          finding.priority === "CRITICAL" ||
          finding.priority === "HIGH" ||
          finding.humanReviewRequired,
      )
      .slice(0, 10),
    actionQueue: dashboard.actions.slice(0, 10),
    academy: dashboard.academyRecommendations,
    consulting: dashboard.consultingRecommendations,
    software: dashboard.softwareRecommendations,
  };
}
