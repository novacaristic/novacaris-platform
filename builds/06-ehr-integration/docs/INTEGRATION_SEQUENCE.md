# Integration Sequence

1. Build 01 authenticates the actor.
2. Build 02 resolves canonical patient/encounter/note.
3. Build 03 creates the controlled agent task.
4. Build 05 confirms the clinical document state.
5. Build 08 evaluates agent/tool policy and approval.
6. Build 06 creates the idempotent EHR request.
7. Adapter performs the external operation.
8. Response is normalized and stored.
9. Build 08 writes the action ledger.
10. Build 02/Build 01 preserve the resulting audit trail.

No adapter call is considered authorized merely because an AI agent requested it.
