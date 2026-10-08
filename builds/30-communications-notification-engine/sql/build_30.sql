CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_notification_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 template_key text NOT NULL,
 channel text NOT NULL,
 version text NOT NULL,
 subject_template text,
 body_template text NOT NULL,
 sensitivity_class text NOT NULL DEFAULT 'internal',
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 UNIQUE(tenant_id,template_key,channel,version)
);

CREATE TABLE IF NOT EXISTS nova_communication_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 channel text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 quiet_hours_start time,
 quiet_hours_end time,
 timezone text,
 categories jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,user_id,channel)
);

CREATE TABLE IF NOT EXISTS nova_notification_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid,
 policy_key text NOT NULL,
 event_type text NOT NULL,
 channel text NOT NULL,
 sensitivity_class text NOT NULL DEFAULT 'internal',
 authorization_required boolean NOT NULL DEFAULT false,
 max_attempts integer NOT NULL DEFAULT 3,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,policy_key)
);

CREATE TABLE IF NOT EXISTS nova_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 event_type text NOT NULL,
 category text NOT NULL,
 priority text NOT NULL DEFAULT 'normal',
 template_id uuid REFERENCES nova_notification_templates(id),
 recipient_user_id uuid,
 recipient_reference text,
 channel text NOT NULL,
 status text NOT NULL DEFAULT 'queued',
 scheduled_for timestamptz,
 sent_at timestamptz,
 delivered_at timestamptz,
 failed_at timestamptz,
 expires_at timestamptz,
 correlation_id text,
 idempotency_key text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}',
 UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS nova_notification_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id uuid NOT NULL REFERENCES nova_notifications(id),
 attempt_number integer NOT NULL,
 provider text,
 provider_reference text,
 status text NOT NULL,
 error_code text,
 error_message text,
 attempted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(notification_id,attempt_number)
);

CREATE TABLE IF NOT EXISTS nova_notification_escalations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id uuid NOT NULL REFERENCES nova_notifications(id),
 escalation_level integer NOT NULL DEFAULT 1,
 reason text NOT NULL,
 target_user_id uuid,
 status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_notification_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 notification_id uuid REFERENCES nova_notifications(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_delivery
ON nova_notifications(tenant_id,status,scheduled_for);

CREATE INDEX IF NOT EXISTS idx_notification_attempts
ON nova_notification_attempts(notification_id,attempt_number);

CREATE INDEX IF NOT EXISTS idx_notification_events
ON nova_notification_events(tenant_id,created_at);
