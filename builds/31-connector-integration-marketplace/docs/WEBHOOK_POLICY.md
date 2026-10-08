# Webhook Policy

Inbound webhooks must:
- verify provider authenticity/signature
- reject replayed or expired events where supported
- use idempotent event processing
- validate tenant/connector association
- limit payload logging
- normalize provider event types
- emit traceable integration events

Outbound webhooks require explicit destination allowlisting and policy authorization.
