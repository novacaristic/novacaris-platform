# Build 36 — NOVA Support & Service Desk Engine

Build 36 manages customer support requests, incidents, service requests, escalation and resolution verification across NovaCarïs.

## Core loop

RECEIVE → CLASSIFY → PRIORITIZE → ASSIGN → INVESTIGATE → RESOLVE → VERIFY → CLOSE → LEARN.

## Scope

- customer support tickets
- incident and service-request types
- severity and priority
- queues, assignment and ownership
- response/resolution targets
- SLA clock events and pause reasons
- escalation policies
- customer communications
- internal notes and secure references
- knowledge-base articles
- engineering handoffs
- customer confirmation and reopen
- root-cause references
- support analytics

## Boundaries

A support ticket is not automatically a reliability incident; a platform incident may link to many tickets. Build 22 owns system reliability/incident telemetry. Build 30 owns message delivery. Build 21 owns security and privacy decisions.

Never put unnecessary patient information, secrets, access tokens or protected data in ticket titles or ordinary notes. Sensitive cases should use restricted records and secure references.
