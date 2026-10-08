# Agent Handoff Protocol

A handoff contains:

- source agent
- target agent
- objective
- correlation ID
- permitted context
- evidence references
- expected output
- risk
- deadline
- authorization state

Target agents receive only the context necessary for their assigned task.

Handoffs cannot be used to expand tenant, patient or tool permissions.

A specialist can reject a handoff when context is insufficient or policy prohibits the work.
