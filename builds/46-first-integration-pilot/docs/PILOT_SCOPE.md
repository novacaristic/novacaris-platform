# Pilot Scope

## Included
- synthetic tenant and actor context
- one non-clinical demo-task operation
- pinned Build 44 request/event contract
- policy decision supplied by a test dependency
- simulated downstream adapter
- idempotency behavior
- correlated completion event
- positive and negative test cases

## Excluded
- real patient or other sensitive data
- live EHR or payer connector
- clinical documentation finalization
- production billing or payment
- external writes to a real system
- production deployment
- claims of compliance certification

## Exit criteria
The pilot is eligible for staging consideration only after all required tests pass in CI, adapter behavior is reviewed, authorization boundaries are independently verified, and test evidence identifies the exact source revision and environment.
