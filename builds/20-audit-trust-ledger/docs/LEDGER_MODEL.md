# Trust Ledger Model

Each ledger event contains:

- tenant
- sequence number
- event type
- actor
- agent/tool when applicable
- subject
- policy decision
- authorization
- correlation ID
- causation ID
- payload
- event hash
- previous event hash
- timestamps

The previous-event hash creates a tamper-evident chain.

A database administrator changing an event would cause downstream hash verification to fail.

The ledger should be append-oriented. Corrections are represented by new events rather than destructive edits.
