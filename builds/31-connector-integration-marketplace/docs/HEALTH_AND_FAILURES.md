# Connector Health & Failures

Health states:
HEALTHY, DEGRADED, UNAVAILABLE, UNKNOWN.

Track:
- connectivity
- latency
- authentication failures
- rate limits
- queue backlog
- sync failures
- mapping failures
- reconciliation discrepancies

Build 22 owns system-wide reliability signals. Connector health feeds Build 22 without pretending an external system is healthy when telemetry is missing.
