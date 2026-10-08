CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_readiness_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 profile_type text NOT NULL,
 scope text NOT NULL,
 target_date timestamptz,
 status text NOT NULL DEFAULT 'developing',
 score numeric(5,2),
 critical_gap_count integer NOT NULL DEFAULT 0,
 open_action_count integer NOT NULL DEFAULT 0,
 evidence_coverage numeric(5,2),
 last_assessed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_readiness_components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES nova_readiness_profiles(id),
 requirement_id uuid REFERENCES nova_requirements(id),
 finding_id uuid REFERENCES nova_compliance_findings(id),
 weight numeric(8,4) NOT NULL,
 score numeric(8,4),
 status text NOT NULL,
 rationale text NOT NULL,
 calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_readiness_gaps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES nova_readiness_profiles(id),
 requirement_id uuid REFERENCES nova_requirements(id),
 finding_id uuid REFERENCES nova_compliance_findings(id),
 severity text NOT NULL,
 gap_type text NOT NULL,
 title text NOT NULL,
 description text NOT NULL,
 status text NOT NULL DEFAULT 'open',
 identified_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_corrective_action_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 gap_id uuid NOT NULL REFERENCES nova_readiness_gaps(id),
 owner_user_id uuid REFERENCES nova_users(id),
 title text NOT NULL,
 action_plan text NOT NULL,
 priority text NOT NULL DEFAULT 'medium',
 due_at timestamptz,
 status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_action_verification_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 action_plan_id uuid NOT NULL REFERENCES nova_corrective_action_plans(id),
 verifier_type text NOT NULL,
 verifier_user_id uuid REFERENCES nova_users(id),
 result text NOT NULL,
 evidence_ids uuid[] NOT NULL DEFAULT '{}',
 rationale text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_readiness_assessment_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES nova_readiness_profiles(id),
 score numeric(5,2),
 status text NOT NULL,
 critical_gap_count integer NOT NULL,
 open_action_count integer NOT NULL,
 evidence_coverage numeric(5,2),
 rationale text NOT NULL,
 calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_readiness_profiles_tenant
ON nova_readiness_profiles(tenant_id,profile_type,status);

CREATE INDEX IF NOT EXISTS idx_readiness_gaps_profile
ON nova_readiness_gaps(profile_id,status,severity);

CREATE INDEX IF NOT EXISTS idx_corrective_actions_owner
ON nova_corrective_action_plans(tenant_id,owner_user_id,status,due_at);
