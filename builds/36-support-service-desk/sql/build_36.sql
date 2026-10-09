CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_support_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 customer_key text NOT NULL,
 organization_name text NOT NULL,
 primary_contact_reference text,
 support_tier text NOT NULL DEFAULT 'standard',
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,customer_key)
);

CREATE TABLE IF NOT EXISTS nova_support_tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 customer_id uuid REFERENCES nova_support_customers(id),
 ticket_key text NOT NULL,
 ticket_type text NOT NULL,
 title text NOT NULL,
 description_reference text,
 status text NOT NULL DEFAULT 'new',
 priority text NOT NULL DEFAULT 'normal',
 severity text NOT NULL DEFAULT 'low',
 source_channel text NOT NULL DEFAULT 'portal',
 requester_reference text,
 assignee_user_id uuid,
 queue_key text,
 related_workflow_reference text,
 related_reliability_incident_reference text,
 related_security_event_reference text,
 opened_at timestamptz NOT NULL DEFAULT now(),
 first_response_at timestamptz,
 resolved_at timestamptz,
 closed_at timestamptz,
 reopened_at timestamptz,
 UNIQUE(tenant_id,ticket_key)
);

CREATE TABLE IF NOT EXISTS nova_support_ticket_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 ticket_id uuid NOT NULL REFERENCES nova_support_tickets(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_support_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id uuid NOT NULL REFERENCES nova_support_tickets(id),
 assigned_to uuid,
 queue_key text,
 assigned_by uuid,
 reason text,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 unassigned_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_support_sla_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 policy_key text NOT NULL,
 support_tier text NOT NULL,
 priority text NOT NULL,
 first_response_minutes integer NOT NULL,
 resolution_target_minutes integer NOT NULL,
 business_calendar_reference text,
 pause_rules jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'draft',
 UNIQUE(tenant_id,policy_key)
);

CREATE TABLE IF NOT EXISTS nova_support_sla_clocks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id uuid NOT NULL REFERENCES nova_support_tickets(id),
 policy_id uuid NOT NULL REFERENCES nova_support_sla_policies(id),
 clock_type text NOT NULL,
 status text NOT NULL DEFAULT 'running',
 started_at timestamptz NOT NULL DEFAULT now(),
 paused_at timestamptz,
 stopped_at timestamptz,
 elapsed_seconds integer NOT NULL DEFAULT 0,
 target_seconds integer NOT NULL,
 breach_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_support_escalations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id uuid NOT NULL REFERENCES nova_support_tickets(id),
 escalation_type text NOT NULL,
 severity text NOT NULL,
 reason text NOT NULL,
 assigned_to uuid,
 status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_support_replies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id uuid NOT NULL REFERENCES nova_support_tickets(id),
 author_type text NOT NULL,
 author_id uuid,
 visibility text NOT NULL DEFAULT 'customer_visible',
 content_reference text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 sent_via_notification_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_support_knowledge_articles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 article_key text NOT NULL,
 version text NOT NULL,
 title text NOT NULL,
 content_reference text NOT NULL,
 category text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 reviewed_by uuid,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(article_key,version)
);

CREATE TABLE IF NOT EXISTS nova_support_ticket_articles (
 ticket_id uuid NOT NULL REFERENCES nova_support_tickets(id),
 article_id uuid NOT NULL REFERENCES nova_support_knowledge_articles(id),
 linked_by uuid,
 linked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(ticket_id,article_id)
);

CREATE TABLE IF NOT EXISTS nova_support_resolution_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id uuid NOT NULL REFERENCES nova_support_tickets(id),
 outcome text NOT NULL,
 resolution_reference text,
 customer_confirmed boolean,
 reviewed_by uuid,
 reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_queue
ON nova_support_tickets(tenant_id,status,priority,opened_at);

CREATE INDEX IF NOT EXISTS idx_support_sla_clocks
ON nova_support_sla_clocks(status,breach_at);

CREATE INDEX IF NOT EXISTS idx_support_events_ticket
ON nova_support_ticket_events(ticket_id,created_at);
