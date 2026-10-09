# Data Freshness & Lineage

Each snapshot should retain:
- source reference(s)
- source watermark or last-updated time
- calculation version
- reporting period
- warnings
- sample size when meaningful

If source data is missing, stale or failed validation, surface that state rather than silently displaying zero or reusing an old value as current.
