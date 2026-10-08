CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_trust_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 sequence_no bigint NOT NULL,
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 agent_id uuid REFERENCES nova_agents(id),
 tool_id uuid REFERENCES nova_tools(id),
 subject_type text,
 subject_id uuid,
 policy_decision_id uuid REFERENCES nova_policy_decisions(id),
 authorization_id uuid REFERENCES nova_authorizations(id),
 correlation_id uuid NOT NULL,
 causation_id uuid,
 event_payload jsonb NOT NULL DEFAULT '{}',
 event_hash text NOT NULL,
 previous_event_hash text,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,sequence_no),
 UNIQUE(tenant_id,event_hash)
);

CREATE TABLE IF NOT EXISTS nova_trust_ledger_checkpoints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 sequence_no bigint NOT NULL,
 terminal_event_hash text NOT NULL,
 checkpoint_hash text NOT NULL,
 generated_at timestamptz NOT NULL DEFAULT now(),
 generated_by text NOT NULL,
 UNIQUE(tenant_id,sequence_no)
);

CREATE TABLE IF NOT EXISTS nova_trust_ledger_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 checkpoint_id uuid NOT NULL REFERENCES nova_trust_ledger_checkpoints(id),
 verification_type text NOT NULL,
 result text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_audit_exports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 requested_by uuid REFERENCES nova_users(id),
 start_sequence bigint,
 end_sequence bigint,
 filter jsonb NOT NULL DEFAULT '{}',
 export_hash text,
 status text NOT NULL DEFAULT 'requested',
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_trust_ledger_correlation
ON nova_trust_ledger(tenant_id,correlation_id,occurred_at);

CREATE INDEX IF NOT EXISTS idx_trust_ledger_subject
ON nova_trust_ledger(tenant_id,subject_type,subject_id,occurred_at);

CREATE INDEX IF NOT EXISTS idx_trust_ledger_actor
ON nova_trust_ledger(tenant_id,actor_type,actor_id,occurred_at);
