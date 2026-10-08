CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_decision_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 requester_user_id uuid REFERENCES nova_users(id),
 source_type text NOT NULL,
 source_id uuid,
 decision_type text NOT NULL,
 title text NOT NULL,
 question text NOT NULL,
 risk_level text NOT NULL DEFAULT 'medium',
 status text NOT NULL DEFAULT 'pending',
 policy_request_id uuid,
 correlation_id uuid NOT NULL,
 due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_decision_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 decision_request_id uuid NOT NULL REFERENCES nova_decision_requests(id),
 option_key text NOT NULL,
 title text NOT NULL,
 description text NOT NULL,
 evidence jsonb NOT NULL DEFAULT '{}',
 risk_summary text,
 consequences text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_decision_votes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 decision_request_id uuid NOT NULL REFERENCES nova_decision_requests(id),
 option_id uuid REFERENCES nova_decision_options(id),
 voter_user_id uuid NOT NULL REFERENCES nova_users(id),
 decision text NOT NULL,
 rationale text NOT NULL,
 evidence_acknowledged boolean NOT NULL DEFAULT false,
 policy_checked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 decision_request_id uuid NOT NULL REFERENCES nova_decision_requests(id),
 authorized_by uuid NOT NULL REFERENCES nova_users(id),
 authorization_type text NOT NULL,
 scope jsonb NOT NULL DEFAULT '{}',
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 status text NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS nova_decision_delegations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 decision_request_id uuid NOT NULL REFERENCES nova_decision_requests(id),
 delegator_user_id uuid NOT NULL REFERENCES nova_users(id),
 delegate_user_id uuid NOT NULL REFERENCES nova_users(id),
 scope jsonb NOT NULL DEFAULT '{}',
 reason text NOT NULL,
 expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_decision_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 decision_request_id uuid NOT NULL REFERENCES nova_decision_requests(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 payload jsonb NOT NULL DEFAULT '{}',
 correlation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_requests_pending
ON nova_decision_requests(tenant_id,status,risk_level,due_at);

CREATE INDEX IF NOT EXISTS idx_authorizations_active
ON nova_authorizations(tenant_id,status,expires_at);

CREATE INDEX IF NOT EXISTS idx_decision_events_request
ON nova_decision_events(decision_request_id,created_at);
