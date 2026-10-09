# Remediation Priorities

Priority 0 — release blockers:
- cross-tenant data exposure
- unauthorized protected-data access
- secret leakage
- unaudited external side effects
- destructive migration without recovery
- fabricated or missing release evidence

Priority 1 — integration blockers:
- broken build/test pipeline
- missing critical API/event contracts
- incompatible schema/migration dependencies
- failed identity, policy, EHR, billing or audit flows

Priority 2 — operational hardening: monitoring, retry/timeout behavior, runbooks, dashboards and support procedures.

Priority 3 — noncritical usability and reporting improvements.

Every finding needs an owner, evidence-backed reproduction, target date, remediation, retest and closure approval.