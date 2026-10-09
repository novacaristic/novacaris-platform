# Evidence Schema

Each run report should include:
- schema version
- run ID
- source revision
- environment
- command and tool versions
- start/end timestamps
- overall status
- passed, failed and skipped counts
- log/report reference
- limitations and exclusions

Status meanings:
- passed: process completed successfully and required tests passed with report evidence
- failed: tests executed and one or more required tests failed, or the test process returned a failure code
- blocked: execution could not proceed because of missing dependencies, configuration, permissions or infrastructure
- not_run: no execution was attempted

Do not count skipped tests as passing. Preserve raw logs in an access-controlled location and keep the summary free of secrets and sensitive payloads.
