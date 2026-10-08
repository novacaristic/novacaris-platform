# Service Health Model

Component status:

HEALTHY
DEGRADED
UNAVAILABLE
MAINTENANCE
UNKNOWN

A component should not be reported HEALTHY merely because its process is running.

Health may include:
- dependency health
- queue health
- recent error rate
- latency
- integration connectivity
- policy/control health

Unknown is a legitimate state when telemetry is missing.
