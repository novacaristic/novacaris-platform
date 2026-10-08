CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_command_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 user_id uuid NOT NULL REFERENCES nova_users(id),
 session_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'active',
 connected_at timestamptz NOT NULL DEFAULT now(),
 disconnected_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_command_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 session_id uuid REFERENCES nova_command_sessions(id),
 event_type text NOT NULL,
 aggregate_type text,
 aggregate_id uuid,
 correlation_id uuid NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}',
 visibility_scope jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_command_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 user_id uuid NOT NULL REFERENCES nova_users(id),
 command_type text NOT NULL,
 card_id uuid REFERENCES nova_command_cards(id),
 correlation_id uuid NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'received',
 policy_request_id uuid,
 action_request_id uuid,
 result jsonb,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_command_events_stream
ON nova_command_events(tenant_id,created_at);

CREATE INDEX IF NOT EXISTS idx_command_requests_user
ON nova_command_requests(tenant_id,user_id,created_at);
