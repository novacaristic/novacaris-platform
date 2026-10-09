# CI Pipeline Contract

Recommended sequence:
1. checkout pinned source revision
2. install from lockfiles
3. static analysis and formatting checks
4. unit tests
5. dependency and secret scanning
6. schema/migration validation
7. contract and integration tests
8. package immutable artifact and digest
9. publish test/evidence summary
10. gate staging or production deployment

A green pipeline applies only to the revision and checks actually run. Missing or skipped required checks must not be treated as passing.
