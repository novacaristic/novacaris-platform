# Logging & Audit Conventions

Structured operational logs should carry timestamp, service, revision, environment, severity, request ID and correlation ID where available.

Do not treat ordinary logs as the authoritative audit ledger. Security-sensitive and consequential events must be written through the appropriate controls, including Builds 20 and 21.

Avoid logging patient data, secrets, authentication material or full sensitive payloads. Prefer stable references and restricted evidence records.
