# Build 63 — Quick Agent Template

A reusable, configuration-first starter for short, bounded NovaCarïs jobs. This is a starter kit, not a claim that arbitrary agents are production-ready in minutes.

## Quick start
1. Copy this folder to a new agent folder.
2. Edit agent.manifest.json: name, purpose, inputs/outputs, tools, risk tier, timeout, and owner.
3. Edit prompt.template.md with the narrow job instructions. Never put secrets or real patient data in prompts.
4. Validate the manifest against agent.manifest.schema.json using a JSON Schema validator.
5. Run in dry-run mode with synthetic data; inspect proposed actions and output.
6. Register a unique agent ID, immutable version, and least-privilege permissions in the host runtime.
7. Test authorization, retries/idempotency, audit, and failure handling.
8. Require independent approval for Tier 2 capabilities before enabling them.
9. Deploy to local/staging and verify health, audit events, and disable/recovery before production.

## Safety rules
- Unknown tools and actions are denied by default.
- This template does not itself authenticate users, enforce permissions, or create an audit ledger; the host runtime/Trust Gate must do that.
- Never put API keys, tokens, passwords, PHI, or secrets in the manifest or prompt.
- Tier 1 is only for explicitly allowlisted low-risk actions with a tested compensation/recovery plan.
- Tier 2 always requires authenticated, authorized human approval bound to the exact action and parameters.
- If identity, policy, audit persistence, or approval verification is unavailable, fail closed.
- Never use a local demo identity adapter in production.
- Do not connect to a live EHR or use real patient data until security, privacy, and compliance validation is complete.

## Contents
- agent.manifest.json — example configuration
- agent.manifest.schema.json — manifest validation contract
- prompt.template.md — replaceable task prompt
- examples/quick-job.json — synthetic example
- USER-MANUAL-ELI10.md — plain-language guide

## What “minutes” means
A simple agent can be configured and dry-run in minutes once the host runtime, model provider, identity, connectors, and Trust Gate are already installed. First-time platform setup, new integrations, security review, and production approval take longer. This folder is not a standalone deployment executable.

## Suggested first jobs
- Summarize a public document into a checklist.
- Check a synthetic form for missing fields.
- Draft a report for human review.
- Classify support requests into approved categories.
- Prepare, but do not send, a response.

## Release checklist
- [ ] Manifest validates
- [ ] Agent and version IDs assigned
- [ ] Inputs and outputs bounded
- [ ] Tools allowlisted with least privilege
- [ ] Dry-run tested with synthetic data
- [ ] Identity and tenant boundaries tested
- [ ] Duplicate request/idempotency tested
- [ ] Audit success and failure events verified
- [ ] Tier 2 approvals tested where applicable
- [ ] Timeout, tool failure, and disable path tested
- [ ] Owner and review date recorded
