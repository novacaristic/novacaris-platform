# Build 31 — NOVA Connector & Integration Marketplace

Build 31 standardizes how NovaCarïs discovers, installs, governs, monitors and removes external-system connectors.

## Core loop

DISCOVER → REVIEW → INSTALL → AUTHORIZE → CONFIGURE → TEST → SYNC → RECONCILE → MONITOR → UPDATE/REMOVE.

## Connector categories

- EHR/clinical systems
- identity providers
- email/SMS providers
- document storage
- analytics/data systems
- payer/provider systems
- regulatory knowledge sources
- funding/opportunity sources
- finance/billing systems
- customer support systems

## Platform principle

NovaCarïs is an intelligence and control layer across existing systems—not a requirement to replace them.

A connector is an integration adapter with explicit capabilities, tenant scope, credential references, versioning, health checks and audit events.

## Security boundary

Connector installation never grants unlimited access. Every invocation remains subject to tenant scope, Build 08 agent/tool policy, Build 21 security/privacy controls, and human authorization where required.
