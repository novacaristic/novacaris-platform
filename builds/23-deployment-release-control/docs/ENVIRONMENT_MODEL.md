# Environment Model

## Development

Purpose:
- rapid implementation
- local testing
- experimental configuration

No development environment is authoritative for production behavior.

## Staging

Purpose:
- release candidate validation
- integration testing
- migration rehearsal
- security/control validation
- representative workflow testing

## Production

Purpose:
- controlled live operations

Production changes require:
- identifiable release
- source revision
- required approval
- deployment evidence
- verification
- rollback path

Environment boundaries must prevent accidental cross-environment writes.
