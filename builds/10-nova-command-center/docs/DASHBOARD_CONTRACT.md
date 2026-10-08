# Dashboard Contract

## GET /v1/command/overview
Returns:
- active alerts
- pending approvals
- open corrective actions
- compliance readiness
- evidence gaps
- agent health
- EHR connection health
- clinical documentation queue
- funding readiness indicators

## GET /v1/command/cards
Returns tenant-scoped command cards.

## GET /v1/command/cards/:id
Returns card details, evidence, source, risk and available governed actions.

## POST /v1/command/cards/:id/investigate
Creates an investigation task for Mr. NOVA.

## POST /v1/command/cards/:id/prepare
Creates a draft action through the appropriate subsystem.

## POST /v1/command/action-requests/:id/authorize
Routes human authorization through the existing Build 08 control plane.

## GET /v1/command/audit
Returns command-related audit events.

The Command Center API never directly performs an external EHR write.
