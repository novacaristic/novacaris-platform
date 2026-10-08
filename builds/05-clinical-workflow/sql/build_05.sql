CREATE TABLE IF NOT EXISTS nova_note_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 note_id uuid NOT NULL REFERENCES nova_notes(id),
 reviewer_user_id uuid NOT NULL REFERENCES nova_users(id),
 decision text NOT NULL,
 comments text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_note_state_transitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 note_id uuid NOT NULL REFERENCES nova_notes(id),
 from_status text NOT NULL,
 to_status text NOT NULL,
 actor_type text NOT NULL,
 actor_user_id uuid REFERENCES nova_users(id),
 reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_document_quality_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 note_id uuid NOT NULL REFERENCES nova_notes(id),
 check_type text NOT NULL,
 result text NOT NULL,
 details jsonb,
 checked_at timestamptz NOT NULL DEFAULT now()
);
