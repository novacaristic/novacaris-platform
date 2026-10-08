# Build 11 — Live Command Runtime

Executable application-layer specification for the NOVA Command Center.

Build 10 defined the cockpit. Build 11 defines the runtime that makes the cockpit live.

## Runtime flow

USER → SESSION → COMMAND API → COMMAND QUERY/ACTION → BUILD 08 POLICY → EXECUTION SUBSYSTEM → EVENT → DASHBOARD

## Responsibilities

- assemble tenant-scoped command state
- stream permitted operational events
- create governed NOVA investigations
- create governed action requests
- expose approval state
- refresh cards after outcomes
- preserve correlation IDs across requests
- surface failures without hiding them

## Non-responsibilities

The runtime does not:
- authenticate outside Build 01
- grant agent permissions
- finalize clinical notes
- directly write to an EHR
- determine compliance independently
- bypass approval gates
