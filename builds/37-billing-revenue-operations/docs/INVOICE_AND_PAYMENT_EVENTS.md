# Invoice & Payment Events

Invoices and payment-provider events are separate records.

Provider callbacks must be authenticated, signature-verified where supported, replay-protected and idempotently processed.

Do not mark an invoice paid from an unverified browser redirect or client-supplied assertion. Provider confirmation is the source for payment outcome.
