# Live Event Model

All live dashboard updates use normalized events.

## Event envelope

- event_id
- event_type
- tenant_id
- aggregate_type
- aggregate_id
- correlation_id
- occurred_at
- visibility_scope
- payload

## Core events

COMMAND_CARD_CREATED
COMMAND_CARD_UPDATED
ALERT_CREATED
APPROVAL_REQUIRED
APPROVAL_GRANTED
APPROVAL_DENIED
AGENT_TASK_STARTED
AGENT_TASK_COMPLETED
AGENT_TASK_FAILED
EHR_REQUEST_QUEUED
EHR_REQUEST_COMPLETED
EHR_REQUEST_FAILED
COMPLIANCE_FINDING_CHANGED
CORRECTIVE_ACTION_CREATED
CORRECTIVE_ACTION_COMPLETED
EVIDENCE_RECEIVED

The client renders events only after server-side scope validation.
