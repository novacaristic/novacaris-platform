# Build 25 — NOVA Tenant & Organization Control Plane

Build 25 establishes the organizational boundary for a multi-tenant NovaCarïs platform.

## Core loop

ONBOARD ORGANIZATION → DEFINE TENANT → CONFIGURE STRUCTURE → ASSIGN USERS → ENABLE SERVICES → APPLY POLICIES → OPERATE → SUSPEND/DEACTIVATE SAFELY.

## Purpose

NovaCarïs must support multiple independent behavioral-health organizations while preserving:

- tenant isolation
- organizational hierarchy
- user membership
- roles
- locations
- departments
- programs
- enabled products
- tenant configuration
- tenant-specific policies
- tenant-specific agents
- integration ownership
- lifecycle state

## Tenant principle

A tenant is an organizational security and operational boundary.

No tenant should be able to access another tenant's protected organizational data merely because a user, agent, integration or workflow exists in both contexts.

## Lifecycle

PROVISIONING → ACTIVE → SUSPENDED → DEACTIVATED

Suspension must stop appropriate operational activity without destroying historical evidence.

Deactivation is a controlled lifecycle event, not a destructive delete.

## Relationship to prior builds

Build 21 enforces security/privacy.
Build 25 gives that security model an explicit organizational boundary.

Build 08 controls agent permissions.
Build 25 determines which organization owns/configures the agent context.

Build 20 records trust events.
Build 25 identifies the tenant and organizational scope associated with those events.
