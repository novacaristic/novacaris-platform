# Failure Triage

Classify issues before remediation:
- environment/setup: missing package manifest, lockfile or test runner
- compile/type error: code cannot compile under the configured project
- assertion failure: behavior differs from expectation
- dependency/interface failure: imports or contract paths do not resolve
- infrastructure failure: runner unavailable or permissions denied
- evidence failure: tests ran but required report metadata is missing

For each failure capture the exact revision, failing command, sanitized error summary, owner, fix and rerun evidence. Do not edit a report to convert a failed run into a pass.
