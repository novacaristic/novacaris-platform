# Secrets and Key Boundaries

Application records should reference secrets and encryption keys; they should not store raw credentials in ordinary application tables.

Use external secret/key management in production.

Examples of references:
- secret reference
- key reference
- certificate reference
- integration credential reference

Mr. NOVA and specialist agents must never expose raw secrets in prompts, memory, logs or audit payloads.
