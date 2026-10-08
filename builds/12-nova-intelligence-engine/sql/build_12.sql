CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_intelligence_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 requested_by uuid REFERENCES nova_users(id),
 agent_task_id uuid REFERENCES nova_agent_tasks(id),
 command_request_id uuid REFERENCES nova_command_requests(id),
 run_type text NOT NULL,
 subject_type text,
 subject_id uuid,
 model_provider text,
 model_name text,
 model_version text,
 status text NOT NULL DEFAULT 'queued',
 started_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_intelligence_context (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES nova_intelligence_runs(id),
 context_type text NOT NULL,
 source_table text,
 source_id uuid,
 content_hash text,
 relevance numeric(5,4),
 permitted boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_intelligence_outputs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES nova_intelligence_runs(id),
 output_type text NOT NULL,
 content jsonb NOT NULL,
 confidence numeric(5,4),
 risk_level text NOT NULL DEFAULT 'low',
 requires_review boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_intelligence_citations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 output_id uuid NOT NULL REFERENCES nova_intelligence_outputs(id),
 evidence_id uuid REFERENCES nova_evidence(id),
 evidence_item_id uuid REFERENCES nova_evidence_items(id),
 citation_role text NOT NULL,
 excerpt text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_intelligence_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES nova_intelligence_runs(id),
 decision_type text NOT NULL,
 decision text NOT NULL,
 rationale text NOT NULL,
 confidence numeric(5,4),
 policy_request_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intelligence_runs_subject
ON nova_intelligence_runs(tenant_id,subject_type,subject_id,created_at);

CREATE INDEX IF NOT EXISTS idx_intelligence_context_run
ON nova_intelligence_context(run_id);

CREATE INDEX IF NOT EXISTS idx_intelligence_outputs_run
ON nova_intelligence_outputs(run_id);
