# Observability Model

Three primary telemetry classes:

## Metrics
Numerical measurements over time.

Examples:
- request latency
- model latency
- queue depth
- error rate
- tool execution duration
- EHR response time
- evidence processing time

## Health Checks
Point-in-time component checks.

## Incidents
A user-impacting or control-impacting reliability condition requiring response.

Telemetry should carry correlation IDs when associated with a workflow.
