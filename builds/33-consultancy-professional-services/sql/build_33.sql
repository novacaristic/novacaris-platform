CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_service_catalog (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 service_key text NOT NULL,
 version text NOT NULL,
 name text NOT NULL,
 category text NOT NULL,
 description text,
 pricing_model text NOT NULL DEFAULT 'fixed_fee',
 list_price numeric(12,2),
 currency text NOT NULL DEFAULT 'USD',
 deliverables jsonb NOT NULL DEFAULT '[]',
 scope_template jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 UNIQUE(service_key,version)
);

CREATE TABLE IF NOT EXISTS nova_client_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 contact_name text NOT NULL,
 organization_name text,
 email_reference text,
 phone_reference text,
 role_title text,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_consulting_engagements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 client_contact_id uuid REFERENCES nova_client_contacts(id),
 service_id uuid REFERENCES nova_service_catalog(id),
 engagement_key text NOT NULL,
 title text NOT NULL,
 status text NOT NULL DEFAULT 'discovery',
 scope jsonb NOT NULL DEFAULT '{}',
 commercial_terms jsonb NOT NULL DEFAULT '{}',
 start_date date,
 target_end_date date,
 actual_end_date date,
 engagement_owner uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,engagement_key)
);

CREATE TABLE IF NOT EXISTS nova_engagement_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 engagement_id uuid NOT NULL REFERENCES nova_consulting_engagements(id),
 version integer NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 scope_reference text,
 price numeric(12,2),
 currency text NOT NULL DEFAULT 'USD',
 assumptions jsonb NOT NULL DEFAULT '[]',
 exclusions jsonb NOT NULL DEFAULT '[]',
 valid_until date,
 reviewed_by uuid,
 approved_by uuid,
 approved_at timestamptz,
 UNIQUE(engagement_id,version)
);

CREATE TABLE IF NOT EXISTS nova_engagement_milestones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 engagement_id uuid NOT NULL REFERENCES nova_consulting_engagements(id),
 milestone_key text NOT NULL,
 title text NOT NULL,
 sequence_number integer NOT NULL,
 due_at timestamptz,
 status text NOT NULL DEFAULT 'pending',
 completed_at timestamptz,
 acceptance_criteria jsonb NOT NULL DEFAULT '[]',
 UNIQUE(engagement_id,milestone_key)
);

CREATE TABLE IF NOT EXISTS nova_engagement_deliverables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 engagement_id uuid NOT NULL REFERENCES nova_consulting_engagements(id),
 milestone_id uuid REFERENCES nova_engagement_milestones(id),
 title text NOT NULL,
 deliverable_type text NOT NULL,
 document_reference text,
 status text NOT NULL DEFAULT 'planned',
 owner_user_id uuid,
 due_at timestamptz,
 submitted_at timestamptz,
 accepted_by uuid,
 accepted_at timestamptz,
 feedback jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nova_engagement_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 engagement_id uuid NOT NULL REFERENCES nova_consulting_engagements(id),
 user_id uuid NOT NULL,
 role_key text NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 removed_at timestamptz,
 UNIQUE(engagement_id,user_id,role_key)
);

CREATE TABLE IF NOT EXISTS nova_engagement_time_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 engagement_id uuid NOT NULL REFERENCES nova_consulting_engagements(id),
 user_id uuid NOT NULL,
 work_date date NOT NULL,
 duration_minutes integer NOT NULL CHECK(duration_minutes > 0),
 description text NOT NULL,
 billable boolean NOT NULL DEFAULT true,
 approval_status text NOT NULL DEFAULT 'pending',
 approved_by uuid,
 approved_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_engagement_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 engagement_id uuid NOT NULL REFERENCES nova_consulting_engagements(id),
 submitted_by uuid NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount >= 0),
 currency text NOT NULL DEFAULT 'USD',
 category text NOT NULL,
 receipt_reference text,
 status text NOT NULL DEFAULT 'submitted',
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_engagement_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 engagement_id uuid NOT NULL REFERENCES nova_consulting_engagements(id),
 requested_by uuid NOT NULL,
 description text NOT NULL,
 scope_impact jsonb NOT NULL DEFAULT '{}',
 cost_impact numeric(12,2),
 schedule_impact jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending',
 decided_by uuid,
 decided_at timestamptz,
 rationale text
);

CREATE TABLE IF NOT EXISTS nova_engagement_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 engagement_id uuid NOT NULL REFERENCES nova_consulting_engagements(id),
 external_invoice_reference text,
 amount numeric(12,2) NOT NULL,
 currency text NOT NULL DEFAULT 'USD',
 status text NOT NULL DEFAULT 'draft',
 issued_at timestamptz,
 due_at timestamptz,
 paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_engagement_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 engagement_id uuid REFERENCES nova_consulting_engagements(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagements_tenant_status
ON nova_consulting_engagements(tenant_id,status);

CREATE INDEX IF NOT EXISTS idx_deliverables_engagement_status
ON nova_engagement_deliverables(engagement_id,status);

CREATE INDEX IF NOT EXISTS idx_engagement_events_tenant
ON nova_engagement_events(tenant_id,created_at);
