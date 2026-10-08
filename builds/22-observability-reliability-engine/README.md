# Build 22 — NOVA Observability & Reliability Engine

Build 22 provides operational visibility and reliability controls across the NovaCarïs platform.

## Core loop

TELEMETRY → METRICS → HEALTH → DETECTION → ALERT → RESPONSE → RECOVERY → POST-INCIDENT LEARNING.

## Observability domains

- API health
- command runtime
- Mr. NOVA and specialist agents
- model/inference latency
- tool execution
- EHR integrations
- database health
- event/queue processing
- evidence workflows
- compliance workflows
- security controls
- authorization workflows

## Key principle

A system that cannot explain its own failures cannot be trusted at scale.

Observability data should be correlated with the Trust Ledger without duplicating sensitive payloads.
