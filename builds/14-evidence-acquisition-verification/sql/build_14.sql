CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_evidence_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 requirement_id uuid REFERENCES nova_requirements(id),
 requested_by uuid REFERENCES nova_users(id),
 evidence_type text NOT NULL,
 title text NOT NULL,
 description text NOT NULL,
 owner_user_id uuid REFERENCES nova_users(id),
 due_at timestamptz,
 priority text NOT NULL DEFAULT 'medium',
 status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_evidence_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 request_id uuid REFERENCES nova_evidence_requests(id),
 evidence_item_id uuid REFERENCES nova_evidence_items(id),
 submitted_by uuid REFERENCES nova_users(id),
 source_type text NOT NULL,
 source_uri text,
 content_hash text,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'submitted'
);

CREATE TABLE IF NOT EXISTS nova_evidence_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 evidence_item_id uuid NOT NULL REFERENCES nova_evidence_items(id),
 verifier_type text NOT NULL,
 verifier_user_id uuid REFERENCES nova_users(id),
 result text NOT NULL,
 confidence numeric(5,4),
 rationale text NOT NULL,
 checks jsonb NOT NULL DEFAULT '{}',
 verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_evidence_expiry_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 evidence_item_id uuid NOT NULL REFERENCES nova_evidence_items(id),
 event_type text NOT NULL,
 detected_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_evidence_requests_open
ON nova_evidence_requests(tenant_id,status,due_at);

CREATE INDEX IF NOT EXISTS idx_evidence_verifications_item
ON nova_evidence_verifications(evidence_item_id,verified_at);
