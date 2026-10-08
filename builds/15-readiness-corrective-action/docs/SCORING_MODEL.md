# Readiness Scoring Model

Default scoring model:

- Evidence coverage: 30%
- Verified compliance findings: 35%
- Critical-gap penalty: 20%
- Corrective-action completion: 15%

## Status

90–100 → READY
75–89.99 → READY WITH CONDITIONS
50–74.99 → DEVELOPING
Below 50 → NOT READY

## Overrides

- unresolved critical gap → NOT READY
- expired critical evidence → cannot be READY
- insufficient evidence → does not automatically equal failure
- human override requires actor, rationale and timestamp

Weights are configurable by profile and must be versioned.
