CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_sales_leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 lead_key text NOT NULL,
 organization_name text,
 contact_name text,
 email_reference text,
 phone_reference text,
 source_key text,
 campaign_key text,
 interest_area text,
 status text NOT NULL DEFAULT 'new',
 owner_user_id uuid,
 consent_status text NOT NULL DEFAULT 'unknown',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,lead_key)
);

CREATE TABLE IF NOT EXISTS nova_sales_qualification (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES nova_sales_leads(id),
 framework_version text NOT NULL,
 score numeric(7,2),
 status text NOT NULL DEFAULT 'unassessed',
 criteria_results jsonb NOT NULL DEFAULT '{}',
 rationale text,
 assessed_by_type text NOT NULL,
 assessed_by_id uuid,
 assessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_sales_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 lead_id uuid REFERENCES nova_sales_leads(id),
 opportunity_key text NOT NULL,
 name text NOT NULL,
 product_or_service text NOT NULL,
 stage text NOT NULL DEFAULT 'qualification',
 status text NOT NULL DEFAULT 'open',
 estimated_value numeric(12,2),
 currency text NOT NULL DEFAULT 'USD',
 probability numeric(5,2),
 expected_close_date date,
 owner_user_id uuid,
 source_key text,
 created_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 outcome_reason text,
 UNIQUE(tenant_id,opportunity_key)
);

CREATE TABLE IF NOT EXISTS nova_sales_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 lead_id uuid REFERENCES nova_sales_leads(id),
 opportunity_id uuid REFERENCES nova_sales_opportunities(id),
 activity_type text NOT NULL,
 subject text NOT NULL,
 notes_reference text,
 owner_user_id uuid,
 due_at timestamptz,
 status text NOT NULL DEFAULT 'planned',
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_sales_stage_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 opportunity_id uuid NOT NULL REFERENCES nova_sales_opportunities(id),
 previous_stage text,
 new_stage text NOT NULL,
 changed_by_type text NOT NULL,
 changed_by_id uuid,
 rationale text,
 changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_sales_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 opportunity_id uuid NOT NULL REFERENCES nova_sales_opportunities(id),
 version integer NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 document_reference text,
 proposed_value numeric(12,2),
 currency text NOT NULL DEFAULT 'USD',
 valid_until date,
 approved_by uuid,
 approved_at timestamptz,
 customer_decision text,
 customer_decided_at timestamptz,
 UNIQUE(opportunity_id,version)
);

CREATE TABLE IF NOT EXISTS nova_sales_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 campaign_key text NOT NULL,
 name text NOT NULL,
 channel text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 budget numeric(12,2),
 currency text NOT NULL DEFAULT 'USD',
 start_date date,
 end_date date,
 attribution_rules jsonb NOT NULL DEFAULT '{}',
 UNIQUE(tenant_id,campaign_key)
);

CREATE TABLE IF NOT EXISTS nova_sales_conversions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 opportunity_id uuid NOT NULL REFERENCES nova_sales_opportunities(id),
 target_type text NOT NULL,
 target_reference text NOT NULL,
 converted_by uuid,
 converted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(opportunity_id,target_type,target_reference)
);

CREATE TABLE IF NOT EXISTS nova_sales_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 lead_id uuid REFERENCES nova_sales_leads(id),
 opportunity_id uuid REFERENCES nova_sales_opportunities(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_tenant_status
ON nova_sales_leads(tenant_id,status);

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_pipeline
ON nova_sales_opportunities(tenant_id,status,stage,expected_close_date);

CREATE INDEX IF NOT EXISTS idx_sales_activities_due
ON nova_sales_activities(tenant_id,status,due_at);

CREATE INDEX IF NOT EXISTS idx_sales_events_tenant
ON nova_sales_events(tenant_id,created_at);
