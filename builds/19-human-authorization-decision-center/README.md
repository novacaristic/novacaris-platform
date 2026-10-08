# Build 19 — NOVA Human Authorization & Decision Center

Build 19 is the formal human-in-the-loop layer for consequential NovaCarïs decisions.

## Core principle

AI recommends. Humans decide. Governed systems execute. Audit records the decision.

## Decision flow

RECOMMENDATION → REVIEW → EVIDENCE → RISK → DECISION → AUTHORIZATION → EXECUTION → VERIFICATION.

## Decision types

- approve
- deny
- request_more_information
- defer
- delegate
- revoke
- override
- acknowledge

## Human control

Build 19 does not create a parallel permission system. It records and routes decisions through Build 08 policy and authorization controls.

A human decision cannot grant permissions the actor does not possess.

High-risk decisions may require multiple approvers according to policy.

## Design goal

Make every consequential NOVA-assisted decision explainable:
who decided, what they saw, what evidence supported it, what policy applied, what they decided, when authorization expires, and what happened afterward.
