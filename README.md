# NovaCarïs Platform — Trust & Intelligence Foundation

This repository contains the first implementation foundation for NovaCarïs regulated intelligence.

## Product surfaces

1. Maryland MPRIME Readiness Check
2. COMAR Organization → Site → Service → Requirement graph
3. Agent Registry + Permission Registry
4. Evidence Ledger + Human Authorization
5. Government Opportunity Intelligence scoring

## Architecture

Organization → Site → Service → Requirement → Evidence → Risk → Action → Verification

Agents operate through a separate authorization plane:

Agent → Permission → Evidence → Human Authorization → Action → Ledger

Funding intelligence uses:

Opportunity → Eligibility → Mission → Geography → Capability → Evidence → Activity → Timing → Recommendation

## Safety rule

Regulatory content is versioned and source-backed. Proposed language must not be represented as current enforceable law. Consequential actions require explicit authorization.

## Current Maryland source assumptions

- Maryland Medicaid says MPRIME replaces ePREP in October 2026 and that providers need to hold claims until enrolled through MPRIME.
- Maryland BHA labels the current COMAR 10.63 draft as proposed language posted for comment/feedback and not for promulgation.

These assumptions must be refreshed by a source-ingestion job before production decisions are made.
