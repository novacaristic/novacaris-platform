# Build 03 — Mr. NOVA Runtime

The controlled agent execution runtime for NovaCarïs.

## Execution lifecycle
REQUEST → CONTEXT → PLAN → POLICY → AUTHORIZATION → TOOL EXECUTION → RESULT → AUDIT.

Mr. NOVA may:
- retrieve permitted information
- reason over approved context
- summarize
- draft
- recommend
- prepare actions

Mr. NOVA may not independently:
- finalize clinical documentation
- change patient assignment
- release protected information
- grant itself permissions
- bypass policy
- perform external EHR writes without authorization.

Every tool invocation receives a risk classification and execution envelope.
