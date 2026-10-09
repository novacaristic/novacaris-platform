# Build 47 — NOVA Pilot Execution & Evidence Runner

Build 47 standardizes how the Build 46 synthetic integration pilot is executed and how its results are captured. It adds a reproducible test package, runner contract, machine-readable evidence format and result classification.

## Core loop

PIN REVISION → INSTALL LOCKED DEPENDENCIES → RUN PILOT TESTS → CAPTURE OUTPUT → CLASSIFY RESULT → PUBLISH EVIDENCE → REVIEW FAILURES.

## Scope

- pilot test command and setup requirements
- test-run metadata and evidence schema
- machine-readable JSON report format
- result classifications: passed, failed, blocked, not_run
- source revision and environment capture
- CI integration guidance
- evidence validation
- failure triage and rerun rules

## Honest status

These files define the execution and evidence process. A committed runner is not proof that a test run occurred. A run may be marked passed only when an actual process exits successfully and its report includes the tested revision, environment, command and test results.

The current Build 46 pilot remains synthetic and uses a simulated adapter. This runner does not connect to an EHR or deploy the application.
