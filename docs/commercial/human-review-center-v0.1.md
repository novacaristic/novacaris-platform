# Human Review Center v0.1

The Human Review Center is the control surface for consequential Mr. NOVA actions.

## Review flow

Request -> Evidence -> Recommendation -> Human Review -> Explicit Decision -> Trust Layer -> Authorized Action -> Evidence Ledger

## Rules

- Reviewers must be authenticated and organization-scoped.
- OWNER, ADMIN, and COMPLIANCE roles can make authorization decisions.
- A decision requires a non-empty rationale.
- Approval is scoped to the specified authorization request.
- Approval does not create unrestricted agent autonomy.
- Production execution must remain behind the Trust Layer and Evidence Ledger.

## UI

Static first-pass UI: `web/review/index.html`.

The current buttons intentionally prepare a decision but do not execute a consequential action. Backend ledger integration must be supplied before production authorization execution is enabled.
