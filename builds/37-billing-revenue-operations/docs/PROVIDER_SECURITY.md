# Payment Provider Security

- use approved provider adapters
- keep raw card data outside NovaCarïs
- store secret references, not secrets
- verify webhook signatures
- deduplicate provider events
- use idempotency for provider API calls
- restrict billing exports
- record access and administrative changes
- reconcile provider and internal states
