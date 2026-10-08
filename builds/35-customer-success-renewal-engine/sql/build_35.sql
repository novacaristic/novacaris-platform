CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_success_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 account_key text NOT NULL,
 organization_name text NOT NULL,
 lifecycle_status text NOT NULL DEFAULT 'onboarding',
 customer_owner uuid,
 source_opportunity_reference text,
 service_start_date date,
 renewal_date date,
 account_metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,account_key)
);

CREATE TABLE IF NOT EXISTS nova_success_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES nova_success_accounts(id),
 version integer NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 desired_outcomes jsonb NOT NULL DEFAULT '[]',
 success_measures jsonb NOT NULL DEFAULT '[]',
 reviewed_by uuid,
 approved_by uuid,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,version)
);

CREATE TABLE IF NOT EXISTS nova_success_milestones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES nova_success_accounts(id),
 plan_id uuid REFERENCES nova_success_plans(id),
 milestone_key text NOT NULL,
 title text NOT NULL,
 due_at timestamptz,
 status text NOT NULL DEFAULT 'pending',
 owner_user_id uuid,
 completed_at timestamptz,
 outcome_reference text,
 UNIQUE(account_id,milestone_key)
);

CREATE TABLE IF NOT EXISTS nova_customer_health_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES nova_success_accounts(id),
 score numeric(5,2),
 status text NOT NULL DEFAULT 'unknown',
 dimensions jsonb NOT NULL DEFAULT '{}',
 evidence_references jsonb NOT NULL DEFAULT '[]',
 missing_data jsonb NOT NULL DEFAULT '[]',
 model_version text,
 assessed_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid
);

CREATE TABLE IF NOT EXISTS nova_success_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES nova_success_accounts(id),
 task_type text NOT NULL,
 title text NOT NULL,
 assigned_to uuid,
 due_at timestamptz,
 priority text NOT NULL DEFAULT 'normal',
 status text NOT NULL DEFAULT 'open',
 outcome_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_account_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES nova_success_accounts(id),
 review_period_start date,
 review_period_end date,
 status text NOT NULL DEFAULT 'planned',
 agenda_reference text,
 findings jsonb NOT NULL DEFAULT '{}',
 actions jsonb NOT NULL DEFAULT '[]',
 owner_user_id uuid,
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_customer_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES nova_success_accounts(id),
 feedback_type text NOT NULL,
 score numeric(5,2),
 feedback_reference text,
 sentiment_label text,
 sentiment_confidence numeric(5,2),
 source_type text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid
);

CREATE TABLE IF NOT EXISTS nova_renewal_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES nova_success_accounts(id),
 opportunity_reference text,
 renewal_date date NOT NULL,
 status text NOT NULL DEFAULT 'planned',
 estimated_value numeric(12,2),
 currency text NOT NULL DEFAULT 'USD',
 risk_factors jsonb NOT NULL DEFAULT '[]',
 next_action text,
 owner_user_id uuid,
 approved_by uuid,
 closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_expansion_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES nova_success_accounts(id),
 opportunity_reference text,
 product_or_service text NOT NULL,
 rationale text,
 status text NOT NULL DEFAULT 'identified',
 estimated_value numeric(12,2),
 currency text NOT NULL DEFAULT 'USD',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_success_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 account_id uuid REFERENCES nova_success_accounts(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_success_accounts_lifecycle
ON nova_success_accounts(tenant_id,lifecycle_status,renewal_date);

CREATE INDEX IF NOT EXISTS idx_success_tasks_due
ON nova_success_tasks(account_id,status,due_at);

CREATE INDEX IF NOT EXISTS idx_success_events_tenant
ON nova_success_events(tenant_id,created_at);
