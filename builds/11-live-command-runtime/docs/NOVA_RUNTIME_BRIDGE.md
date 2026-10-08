# NOVA Runtime Bridge

Build 11 connects the Command Center to Build 03 Mr. NOVA Runtime.

## Investigation

Command Center:
1. receives user question
2. verifies scope
3. creates command request
4. creates Build 03 agent task
5. receives NOVA output
6. attaches evidence/provenance
7. emits dashboard event

## Governed action

1. User selects recommended action.
2. Build 11 creates an action request.
3. Build 08 evaluates policy/risk.
4. Authorization is requested when required.
5. Approved request is routed to the correct subsystem.
6. Result is emitted as an event.
7. Command card is refreshed.

Mr. NOVA never receives a hidden privileged execution path from the dashboard.
