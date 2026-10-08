CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_key text NOT NULL UNIQUE,
 name text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 external_subject text NOT NULL,
 email text,
 display_name text,
 status text NOT NULL DEFAULT 'active',
 mfa_verified boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id, external_subject)
);

CREATE TABLE IF NOT EXISTS nova_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 role_key text NOT NULL,
 description text,
 UNIQUE(tenant_id, role_key)
);

CREATE TABLE IF NOT EXISTS nova_user_roles (
 user_id uuid NOT NULL REFERENCES nova_users(id),
 role_id uuid NOT NULL REFERENCES nova_roles(id),
 PRIMARY KEY(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS nova_patients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 external_patient_key text,
 status text NOT NULL DEFAULT 'active',
 privacy_hold boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_patient_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 user_id uuid NOT NULL REFERENCES nova_users(id),
 assignment_role text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 user_id uuid NOT NULL REFERENCES nova_users(id),
 oidc_subject text NOT NULL,
 auth_method text NOT NULL,
 mfa_verified boolean NOT NULL DEFAULT false,
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_privacy_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 placed_by uuid NOT NULL REFERENCES nova_users(id),
 released_by uuid REFERENCES nova_users(id),
 placed_at timestamptz NOT NULL DEFAULT now(),
 released_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 actor_user_id uuid REFERENCES nova_users(id),
 actor_type text NOT NULL,
 action text NOT NULL,
 resource_type text NOT NULL,
 resource_id uuid,
 outcome text NOT NULL,
 reason text,
 request_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_assignments_user ON nova_patient_assignments(tenant_id,user_id,patient_id) WHERE active=true;
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_time ON nova_audit_events(tenant_id,created_at);
