CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_knowledge_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES nova_tenants(id),
 source_key text NOT NULL,
 title text NOT NULL,
 authority text NOT NULL,
 source_type text NOT NULL,
 jurisdiction text,
 publisher text,
 canonical_uri text,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_key)
);

CREATE TABLE IF NOT EXISTS nova_knowledge_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_id uuid NOT NULL REFERENCES nova_knowledge_sources(id),
 version_label text NOT NULL,
 published_at timestamptz,
 effective_from timestamptz,
 effective_to timestamptz,
 retrieved_at timestamptz NOT NULL DEFAULT now(),
 content_hash text NOT NULL,
 content_uri text,
 status text NOT NULL DEFAULT 'current',
 supersedes_version_id uuid REFERENCES nova_knowledge_versions(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,version_label)
);

CREATE TABLE IF NOT EXISTS nova_knowledge_sections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 version_id uuid NOT NULL REFERENCES nova_knowledge_versions(id),
 section_key text NOT NULL,
 heading text,
 source_locator text,
 content text NOT NULL,
 content_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_knowledge_interpretations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 version_id uuid NOT NULL REFERENCES nova_knowledge_versions(id),
 section_id uuid REFERENCES nova_knowledge_sections(id),
 interpretation_type text NOT NULL,
 interpretation text NOT NULL,
 applicability text,
 confidence numeric(5,4),
 status text NOT NULL DEFAULT 'draft',
 reviewed_by uuid REFERENCES nova_users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_requirement_mappings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 interpretation_id uuid NOT NULL REFERENCES nova_knowledge_interpretations(id),
 requirement_id uuid NOT NULL REFERENCES nova_requirements(id),
 mapping_type text NOT NULL,
 rationale text NOT NULL,
 confidence numeric(5,4),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(interpretation_id,requirement_id)
);

CREATE TABLE IF NOT EXISTS nova_knowledge_change_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_id uuid NOT NULL REFERENCES nova_knowledge_sources(id),
 previous_version_id uuid REFERENCES nova_knowledge_versions(id),
 new_version_id uuid REFERENCES nova_knowledge_versions(id),
 change_type text NOT NULL,
 change_summary text,
 detected_at timestamptz NOT NULL DEFAULT now(),
 reviewed boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_knowledge_versions_source
ON nova_knowledge_versions(source_id,effective_from);

CREATE INDEX IF NOT EXISTS idx_knowledge_sections_version
ON nova_knowledge_sections(version_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_interpretations_tenant
ON nova_knowledge_interpretations(tenant_id,status);
