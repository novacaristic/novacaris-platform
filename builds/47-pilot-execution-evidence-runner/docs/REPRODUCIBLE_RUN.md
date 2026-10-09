# Reproducible Pilot Run

Run from the repository root after reviewing the package manager and workspace configuration.

1. Record the full Git commit SHA.
2. Use the committed dependency lockfile; do not silently install floating versions.
3. Run the focused Build 46 pilot test suite.
4. Capture exit code, passed/failed/skipped counts and complete test output.
5. Store the report as a CI artifact or approved evidence reference.
6. Record environment and runtime/tool versions.
7. If the process fails before tests start, classify it as blocked or not_run rather than failed tests.
8. Do not include secrets, patient information or other sensitive payloads in reports.

Illustrative command once the repository's actual test scripts are confirmed:

`npm ci`
`npm test -- --run builds/46-first-integration-pilot/tests/pilot.test.ts`

These commands are examples and may need adapting to the actual workspace configuration.
