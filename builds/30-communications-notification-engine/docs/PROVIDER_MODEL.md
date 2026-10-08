# Provider Model

External communication providers should be abstracted behind a provider adapter.

Provider results should return:
- provider
- provider reference
- accepted/sent/delivered/failed status
- timestamp
- normalized error classification

Provider credentials remain in managed secret infrastructure.

Provider callbacks/webhooks must be authenticated and idempotently reconciled.
