CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_memory (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 scope_type text NOT NULL,
 scope_id uuid NOT NULL,
 memory_type text NOT NULL,
 content text NOT NULL,
 sensitivity text NOT NULL DEFAULT 'restricted',
 source_type text NOT NULL,
 source_id uuid,
 confidence numeric(5,4),
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 subject_type text NOT NULL,
 subject_id uuid NOT NULL,
 evidence_type text NOT NULL,
 source_system text NOT NULL,
 source_id text,
 excerpt text,
 content_uri text,
 confidence numeric(5,4),
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_recommendations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 subject_type text NOT NULL,
 subject_id uuid NOT NULL,
 recommendation_type text NOT NULL,
 title text NOT NULL,
 rationale text NOT NULL,
 evidence_ids uuid[] NOT NULL DEFAULT '{}',
 risk_level text NOT NULL DEFAULT 'low',
 requires_authorization boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'proposed',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_action_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 recommendation_id uuid REFERENCES nova_recommendations(id),
 action_type text NOT NULL,
 payload jsonb NOT NULL,
 authorization_required boolean NOT NULL DEFAULT true,
 authorized_by uuid,
 authorized_at timestamptz,
 idempotency_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending',
 created_at timestamptz NOT NULL DEFAULT now()
);
