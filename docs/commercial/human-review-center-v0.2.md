# Human Review Center v0.2

The review center is now connected to the in-memory Evidence Ledger boundary.

## Closed loop

Mr. NOVA requests authorization -> Evidence Ledger stores PENDING request -> authorized reviewer reviews -> APPROVED/REJECTED decision -> ledger records the decision.

## Controls

- Reviewer must have OWNER, ADMIN, or COMPLIANCE role.
- Authorization request must exist in the ledger.
- Decision rationale is mandatory.
- A request cannot be decided twice.
- The decision is recorded as an Evidence Ledger event.
- Organization scope is checked before decision processing.
- The system does not treat approval as unrestricted agent autonomy.

## Production boundary

The current implementation proves the domain/application control loop with the in-memory ledger. PostgreSQL persistence for authorization requests and ledger entries remains the next persistence step; until that is wired, this is an application security foundation rather than a production deployment.
