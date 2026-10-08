# Delivery & Retry Model

Delivery states:

QUEUED → SENDING → SENT → DELIVERED

Failure path:

SENDING → FAILED → RETRYING → DELIVERED/FAILED/ESCALATED.

Retries require:
- bounded attempts
- retryable error classification
- idempotency
- provider correlation

Do not retry an operation when doing so could create an unsafe duplicate external action.
