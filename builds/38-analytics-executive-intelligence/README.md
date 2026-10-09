# Build 38 — NOVA Analytics & Executive Intelligence Dashboard

Build 38 defines a governed analytics layer for executive, operational and product metrics across NovaCarïs.

## Core loop

SOURCES → METRIC DEFINITIONS → VALIDATION → AGGREGATION → ROLE-SCOPED VIEWS → INSIGHT → HUMAN ACTION.

## Scope

- metric catalog and versioning
- dashboard definitions
- scheduled/report-on-demand snapshots
- revenue and subscription metrics
- sales pipeline and conversion
- customer success and retention
- support workload and service objectives
- Academy enrollment and completion
- compliance/readiness summaries
- connector and runtime reliability
- consultancy engagement performance
- funding opportunity pipeline
- data freshness and lineage
- anomaly/threshold observations
- export governance

## Principles

- Every metric has a definition, owner, source and time window.
- Estimates, projections, invoices, cash collections and accounting-recognized revenue remain distinct.
- Missing/stale data is visible; it is never silently converted to zero or healthy.
- Aggregates should be tenant-scoped and role-authorized.
- Analytics informs decisions; it does not authorize clinical, financial or external side effects.
- Sensitive patient-level data is excluded from general executive dashboards unless a separately approved, minimum-necessary use case requires it.
