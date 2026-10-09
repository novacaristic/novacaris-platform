CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_ai_providers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_key text NOT NULL UNIQUE,
 name text NOT NULL,
 security_review_status text NOT NULL DEFAULT 'pending',
 data_handling_reference text,
 contract_reference text,
 status text NOT NULL DEFAULT 'active',
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_ai_models (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_id uuid NOT NULL REFERENCES nova_ai_providers(id),
 model_key text NOT NULL,
 display_name text NOT NULL,
 model_family text,
 capabilities jsonb NOT NULL DEFAULT '[]',
 limitations jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'registered',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_id,model_key)
);

CREATE TABLE IF NOT EXISTS nova_ai_model_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 model_id uuid NOT NULL REFERENCES nova_ai_models(id),
 version_key text NOT NULL,
 provider_version_reference text,
 configuration_fingerprint text NOT NULL,
 release_notes text,
 status text NOT NULL DEFAULT 'registered',
 registered_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(model_id,version_key,configuration_fingerprint)
);

CREATE TABLE IF NOT EXISTS nova_ai_use_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 use_case_key text NOT NULL,
 version text NOT NULL,
 name text NOT NULL,
 business_owner_role text NOT NULL,
 description text NOT NULL,
 risk_tier text NOT NULL DEFAULT 'unassessed',
 affected_users jsonb NOT NULL DEFAULT '[]',
 data_classes jsonb NOT NULL DEFAULT '[]',
 human_oversight_requirements jsonb NOT NULL DEFAULT '{}',
 prohibited_behaviors jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'draft',
 reviewed_by uuid,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(use_case_key,version)
);

CREATE TABLE IF NOT EXISTS nova_ai_evaluation_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 use_case_id uuid NOT NULL REFERENCES nova_ai_use_cases(id),
 plan_key text NOT NULL,
 version text NOT NULL,
 acceptance_criteria jsonb NOT NULL DEFAULT '[]',
 test_set_reference text NOT NULL,
 evaluator_role text,
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(use_case_id,plan_key,version)
);

CREATE TABLE IF NOT EXISTS nova_ai_evaluation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL REFERENCES nova_ai_evaluation_plans(id),
 model_version_id uuid NOT NULL REFERENCES nova_ai_model_versions(id),
 configuration_fingerprint text NOT NULL,
 status text NOT NULL DEFAULT 'queued',
 results jsonb NOT NULL DEFAULT '{}',
 failures jsonb NOT NULL DEFAULT '[]',
 evidence_references jsonb NOT NULL DEFAULT '[]',
 started_at timestamptz,
 completed_at timestamptz,
 evaluator_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_ai_deployments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 use_case_id uuid NOT NULL REFERENCES nova_ai_use_cases(id),
 model_version_id uuid NOT NULL REFERENCES nova_ai_model_versions(id),
 evaluation_run_id uuid REFERENCES nova_ai_evaluation_runs(id),
 environment text NOT NULL,
 status text NOT NULL DEFAULT 'proposed',
 configuration_fingerprint text NOT NULL,
 approved_by uuid,
 approved_at timestamptz,
 deployed_at timestamptz,
 retired_at timestamptz,
 rollback_reference text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_ai_governance_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 event_type text NOT NULL,
 subject_type text NOT NULL,
 subject_reference text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 rationale text,
 evidence_references jsonb NOT NULL DEFAULT '[]',
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_ai_monitoring_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_id uuid NOT NULL REFERENCES nova_ai_deployments(id),
 observation_type text NOT NULL,
 severity text NOT NULL DEFAULT 'info',
 observed_value numeric(20,6),
 threshold_reference jsonb NOT NULL DEFAULT '{}',
 evidence_reference text,
 status text NOT NULL DEFAULT 'open',
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_ai_incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_id uuid REFERENCES nova_ai_deployments(id),
 incident_key text NOT NULL UNIQUE,
 severity text NOT NULL,
 category text NOT NULL,
 description_reference text NOT NULL,
 status text NOT NULL DEFAULT 'open',
 containment_action_reference text,
 root_cause_reference text,
 corrective_action_reference text,
 opened_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 reviewed_by uuid
);

CREATE TABLE IF NOT EXISTS nova_ai_prompt_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 prompt_key text NOT NULL,
 version text NOT NULL,
 content_reference text NOT NULL,
 content_fingerprint text NOT NULL,
 intended_use_case text,
 status text NOT NULL DEFAULT 'draft',
 reviewed_by uuid,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(prompt_key,version,content_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_ai_models_status
ON nova_ai_models(status);

CREATE INDEX IF NOT EXISTS idx_ai_deployments_use_case
ON nova_ai_deployments(use_case_id,status);

CREATE INDEX IF NOT EXISTS idx_ai_monitoring_open
ON nova_ai_monitoring_observations(status,severity,created_at);

CREATE INDEX IF NOT EXISTS idx_ai_governance_events
ON nova_ai_governance_events(subject_type,subject_reference,created_at);
