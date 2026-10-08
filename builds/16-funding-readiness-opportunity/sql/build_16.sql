CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_funding_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 opportunity_key text NOT NULL,
 title text NOT NULL,
 funder_name text NOT NULL,
 opportunity_type text NOT NULL,
 jurisdiction text,
 source_uri text,
 published_at timestamptz,
 opens_at timestamptz,
 deadline_at timestamptz,
 status text NOT NULL DEFAULT 'active',
 award_min numeric(14,2),
 award_max numeric(14,2),
 eligibility_summary text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,opportunity_key)
);

CREATE TABLE IF NOT EXISTS nova_opportunity_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 opportunity_id uuid NOT NULL REFERENCES nova_funding_opportunities(id),
 requirement_code text NOT NULL,
 title text NOT NULL,
 description text NOT NULL,
 mandatory boolean NOT NULL DEFAULT true,
 evidence_type text,
 source_locator text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_opportunity_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 opportunity_id uuid NOT NULL REFERENCES nova_funding_opportunities(id),
 readiness_profile_id uuid REFERENCES nova_readiness_profiles(id),
 eligibility_status text NOT NULL DEFAULT 'unknown',
 readiness_score numeric(5,2),
 confidence numeric(5,4),
 rationale text NOT NULL,
 assessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_opportunity_gaps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 opportunity_id uuid NOT NULL REFERENCES nova_funding_opportunities(id),
 requirement_id uuid REFERENCES nova_opportunity_requirements(id),
 gap_type text NOT NULL,
 severity text NOT NULL,
 description text NOT NULL,
 evidence_needed text,
 status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_funding_application_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 opportunity_id uuid NOT NULL REFERENCES nova_funding_opportunities(id),
 owner_user_id uuid REFERENCES nova_users(id),
 status text NOT NULL DEFAULT 'planning',
 target_submission_at timestamptz,
 readiness_score numeric(5,2),
 narrative_status text NOT NULL DEFAULT 'not_started',
 budget_status text NOT NULL DEFAULT 'not_started',
 evidence_status text NOT NULL DEFAULT 'not_started',
 review_status text NOT NULL DEFAULT 'not_reviewed',
 submission_status text NOT NULL DEFAULT 'not_submitted',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_funding_outcomes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 opportunity_id uuid NOT NULL REFERENCES nova_funding_opportunities(id),
 application_plan_id uuid REFERENCES nova_funding_application_plans(id),
 outcome text NOT NULL,
 award_amount numeric(14,2),
 decision_at timestamptz,
 rationale text,
 lessons_learned text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funding_deadlines
ON nova_funding_opportunities(deadline_at,status);

CREATE INDEX IF NOT EXISTS idx_opportunity_gaps
ON nova_opportunity_gaps(opportunity_id,status,severity);

CREATE INDEX IF NOT EXISTS idx_application_plans
ON nova_funding_application_plans(tenant_id,status,target_submission_at);
