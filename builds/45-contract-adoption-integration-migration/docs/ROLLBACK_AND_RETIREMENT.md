# Rollback & Legacy Retirement

Rollback criteria should include contract validation failures, tenant-scope regression, authorization bypass, event loss, duplicate side effects and material latency/error increases.

A migration wave should preserve the last known-compatible adapter or interface until verification completes. Legacy retirement requires:
- all known consumers inventoried
- compatibility and regression tests passed
- no active dependency on the legacy format
- monitoring evidence over an agreed window
- rollback path or forward-recovery plan
- accountable approval and audit record