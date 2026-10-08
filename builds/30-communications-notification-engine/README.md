# Build 30 — NOVA Communications & Notification Engine

Build 30 provides governed communication and notification delivery across NovaCarïs.

## Core loop

EVENT → POLICY → AUDIENCE → TEMPLATE → QUEUE → DELIVER → CONFIRM → RETRY/ESCALATE → AUDIT.

## Channels

- in-app
- email
- SMS
- webhook/system notification

Additional channels can be added through governed providers.

## Scope

- notification templates
- communication preferences
- recipient resolution
- message queue
- delivery attempts
- retries
- escalation
- scheduling
- deduplication
- quiet hours
- delivery status
- provider references
- communication audit events

## Safety principle

A notification system must not become an uncontrolled disclosure channel.

Build 21 privacy/security controls remain authoritative. Sensitive content should be minimized, recipients must be authorized, and external delivery requires appropriate policy.

## Mr. NOVA

Mr. NOVA can prepare and recommend communications. Sending consequential or sensitive communications remains subject to policy and authorization.
