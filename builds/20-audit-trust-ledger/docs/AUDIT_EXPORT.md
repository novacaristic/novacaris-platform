# Audit Export

Authorized users may request a bounded audit export.

Exports should include:

- selected sequence range
- filters
- event count
- terminal hash
- export hash
- generation timestamp
- requesting actor
- authorization basis

Sensitive payloads should be minimized according to scope.

An export is a view of ledger history, not a replacement for the ledger.
