# Build 21 — NOVA Security & Privacy Control Plane

Build 21 establishes the security and privacy enforcement layer for NovaCarïs.

## Core principle

IDENTITY → SCOPE → DATA CLASSIFICATION → POLICY → ACCESS DECISION → ACTION → SECURITY EVENT → AUDIT.

## Security domains

- tenant isolation
- subject/patient scope
- sensitive-data classification
- Privacy Hold
- least-privilege access
- emergency/break-glass access
- retention and legal hold
- session/security events
- data export controls
- secret/key references
- anomaly detection
- security incident escalation

## Hard boundary

Build 21 does not replace identity, authorization or application-level policy. It provides additional security controls and enforcement points.

Unknown scope, expired authorization, invalid purpose or unresolved policy conflict fails closed unless an explicitly governed emergency path applies.
