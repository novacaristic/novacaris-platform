# Identity & Access Boundary v0.1

NovaCarïs now has an identity-provider-neutral boundary for production authentication.

## Flow

OIDC token → IdentityVerifier → IdentityClaims → organization membership resolver → AuthenticatedSession → workspace authorization.

## Rules

- Identity subject comes from the verified token, not browser input.
- Organization access requires an explicit membership lookup.
- Every workspace operation must enforce organization scope.
- Roles are evaluated after membership resolution.
- OIDC issuer configuration must use HTTPS.
- Secrets, signing keys, client secrets, and tokens never belong in the repository.

## Production adapter

A production implementation should connect IdentityVerifier to a standards-compliant OIDC provider and validate issuer, audience, signature, expiration, nonce/state where applicable, and required claims.

This layer intentionally does not choose a vendor.
