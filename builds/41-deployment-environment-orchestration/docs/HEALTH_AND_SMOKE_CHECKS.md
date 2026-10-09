# Health & Smoke Checks

Post-deployment checks should verify:
- process/service health
- readiness endpoints
- database connectivity and schema version
- identity/session flow
- policy gate availability
- event and audit write paths
- connector status using safe test fixtures
- critical user journeys
- error and latency thresholds

A successful deploy command is not proof of a healthy release. Record check output and source revision.
