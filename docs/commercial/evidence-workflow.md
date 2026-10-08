# Evidence Workflow v0.1

The portal now has a defined evidence intake boundary.

Flow:

Authenticated session → organization-scoped submission → upload policy → evidence repository → NOVA assessment.

## Controls

- Evidence is assigned to the authenticated organization.
- Cross-organization evidence writes are rejected.
- Evidence kinds can be allow-listed.
- Payload size can be constrained.
- Selected evidence kinds can require human review.
- The application layer does not declare evidence to be legally sufficient merely because it was uploaded.

Production requirements:
- encrypted object storage for files
- malware/content validation where applicable
- immutable metadata/audit events
- retention policy
- access logging
- PHI/security controls before regulated data is accepted
