# Hash Chain

For each tenant:

event_hash = HASH(canonical_event_payload + previous_event_hash)

The first event uses a defined genesis value.

Canonical serialization must be deterministic.

## Verification

Starting from a trusted checkpoint:

1. load each event in sequence order
2. recompute its canonical hash
3. compare to stored event_hash
4. compare previous_event_hash to prior event_hash
5. report the first mismatch
6. preserve verification result

A successful verification proves chain consistency for the verified range; it does not by itself prove that every source system record is truthful.
