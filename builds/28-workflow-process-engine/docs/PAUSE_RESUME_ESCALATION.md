# Pause, Resume & Escalation

A workflow may pause because:
- evidence is missing
- approval is pending
- an integration is unavailable
- a dependency failed
- a timer has not elapsed
- human review is required

Escalation records:
- reason
- severity
- affected step
- responsible party
- created/resolved times

Resume must re-evaluate prerequisites and authorization rather than blindly continuing from stale state.
