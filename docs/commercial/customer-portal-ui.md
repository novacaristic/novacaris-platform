# NovaCarïs Customer Portal UI v0.1

## Purpose
A lightweight customer-facing web shell for the NovaCarïs portal. It turns the existing customer workspace, dashboard model, readiness, action queue, Academy, Consulting, Funding and Governance concepts into a navigable interface.

## Current state
- Static frontend shell under `web/`
- No authentication
- No persistent customer data
- No API connection
- No production authorization workflow
- Domain logic remains in `src/` and is not bypassed by the UI

## Screens represented
- Overview
- Readiness
- Evidence/action queue
- Academy
- Consulting
- Funding
- Governance/navigation

## Safety boundary
The UI deliberately labels readiness as an assessment rather than approval. Consequential actions must remain behind the Agent Registry, Permission Registry, Human Authorization and Evidence Ledger.

## Next application layer
1. Add an application server/API.
2. Connect authenticated organization workspaces.
3. Hydrate the UI from `buildCustomerDashboard()` / `buildDashboardViewModel()`.
4. Add evidence upload and review workflows.
5. Add human-authorization screens backed by the NOVA Trust Layer.
6. Add audit/evidence-ledger views.
