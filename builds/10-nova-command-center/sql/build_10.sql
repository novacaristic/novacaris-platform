CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_command_views (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 user_id uuid NOT NULL REFERENCES nova_users(id),
 view_key text NOT NULL,
 configuration jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,user_id,view_key)
);

CREATE TABLE IF NOT EXISTS nova_command_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 card_key text NOT NULL,
 card_type text NOT NULL,
 title text NOT NULL,
 severity text NOT NULL DEFAULT 'info',
 source_type text NOT NULL,
 source_id uuid,
 status text NOT NULL DEFAULT 'open',
 summary text NOT NULL,
 action_required boolean NOT NULL DEFAULT false,
 authorization_required boolean NOT NULL DEFAULT false,
 metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_command_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 alert_type text NOT NULL,
 severity text NOT NULL,
 source_type text NOT NULL,
 source_id uuid,
 title text NOT NULL,
 message text NOT NULL,
 status text NOT NULL DEFAULT 'open',
 acknowledged_by uuid REFERENCES nova_users(id),
 acknowledged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_command_action_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 card_id uuid NOT NULL REFERENCES nova_command_cards(id),
 action_request_id uuid,
 action_label text NOT NULL,
 risk_level text NOT NULL,
 authorization_required boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'available',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_command_cards_status
ON nova_command_cards(tenant_id,status,severity);

CREATE INDEX IF NOT EXISTS idx_command_alerts_open
ON nova_command_alerts(tenant_id,status,severity);
