# EHR Adapter Contract

Every adapter exposes the logical operations:

- healthCheck()
- resolvePatient()
- resolveEncounter()
- createDocument()
- updateDocument()
- fetchDocument()
- submitFinalDocument()

Adapter requirements:
1. validate tenant connection
2. validate canonical identifiers
3. enforce idempotency
4. return normalized status
5. preserve external IDs
6. never bypass NovaCarïs authorization
7. emit integration audit events

The adapter is an execution boundary, not a policy engine.
