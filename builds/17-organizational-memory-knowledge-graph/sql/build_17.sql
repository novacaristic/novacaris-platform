CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_graph_entities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 entity_type text NOT NULL,
 entity_key text NOT NULL,
 display_name text,
 source_table text,
 source_id uuid,
 status text NOT NULL DEFAULT 'active',
 sensitivity text NOT NULL DEFAULT 'internal',
 attributes jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,entity_type,entity_key)
);

CREATE TABLE IF NOT EXISTS nova_graph_relationships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 from_entity_id uuid NOT NULL REFERENCES nova_graph_entities(id),
 relationship_type text NOT NULL,
 to_entity_id uuid NOT NULL REFERENCES nova_graph_entities(id),
 confidence numeric(5,4),
 source_type text,
 source_id uuid,
 valid_from timestamptz,
 valid_to timestamptz,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(from_entity_id,relationship_type,to_entity_id)
);

CREATE TABLE IF NOT EXISTS nova_graph_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 entity_id uuid REFERENCES nova_graph_entities(id),
 event_type text NOT NULL,
 event_time timestamptz NOT NULL DEFAULT now(),
 actor_type text,
 actor_id uuid,
 source_id uuid,
 payload jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_graph_assertions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 entity_id uuid NOT NULL REFERENCES nova_graph_entities(id),
 attribute_key text NOT NULL,
 attribute_value jsonb NOT NULL,
 source_type text NOT NULL,
 source_id uuid,
 confidence numeric(5,4),
 valid_from timestamptz,
 valid_to timestamptz,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_entities_type
ON nova_graph_entities(tenant_id,entity_type,status);

CREATE INDEX IF NOT EXISTS idx_graph_relationships_from
ON nova_graph_relationships(tenant_id,from_entity_id,status);

CREATE INDEX IF NOT EXISTS idx_graph_relationships_to
ON nova_graph_relationships(tenant_id,to_entity_id,status);

CREATE INDEX IF NOT EXISTS idx_graph_events_entity
ON nova_graph_events(tenant_id,entity_id,event_time);
