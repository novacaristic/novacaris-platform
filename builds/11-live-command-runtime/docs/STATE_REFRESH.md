# State Refresh Strategy

The Command Center uses three layers:

1. Initial snapshot
2. Live events
3. Periodic reconciliation

Live events provide responsiveness. Reconciliation prevents a dropped event from creating stale state.

If event delivery fails, the UI marks the connection degraded and requests a fresh authorized snapshot.

Never infer completion solely from a client-side optimistic update.
