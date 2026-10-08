CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_product_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_key text NOT NULL,
 version text NOT NULL,
 display_name text NOT NULL,
 description text,
 billing_interval text NOT NULL DEFAULT 'monthly',
 base_price numeric(12,2),
 currency text NOT NULL DEFAULT 'USD',
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(plan_key,version)
);

CREATE TABLE IF NOT EXISTS nova_plan_features (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL REFERENCES nova_product_plans(id),
 feature_key text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 limit_value numeric,
 limit_unit text,
 metadata jsonb NOT NULL DEFAULT '{}',
 UNIQUE(plan_id,feature_key)
);

CREATE TABLE IF NOT EXISTS nova_plan_addons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL REFERENCES nova_product_plans(id),
 addon_key text NOT NULL,
 display_name text NOT NULL,
 pricing_model text NOT NULL,
 price numeric(12,2),
 currency text NOT NULL DEFAULT 'USD',
 status text NOT NULL DEFAULT 'active',
 UNIQUE(plan_id,addon_key)
);

CREATE TABLE IF NOT EXISTS nova_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 plan_id uuid NOT NULL REFERENCES nova_product_plans(id),
 status text NOT NULL DEFAULT 'trialing',
 external_billing_reference text,
 started_at timestamptz NOT NULL DEFAULT now(),
 trial_ends_at timestamptz,
 current_period_start timestamptz,
 current_period_end timestamptz,
 canceled_at timestamptz,
 cancellation_reason text
);

CREATE TABLE IF NOT EXISTS nova_subscription_addons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL REFERENCES nova_subscriptions(id),
 addon_id uuid NOT NULL REFERENCES nova_plan_addons(id),
 quantity numeric(12,2) NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'active',
 started_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 subscription_id uuid REFERENCES nova_subscriptions(id),
 feature_key text NOT NULL,
 status text NOT NULL DEFAULT 'enabled',
 limit_value numeric,
 limit_unit text,
 source text NOT NULL DEFAULT 'plan',
 effective_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nova_usage_counters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 feature_key text NOT NULL,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 quantity numeric(16,4) NOT NULL DEFAULT 0,
 unit text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,feature_key,period_start,period_end)
);

CREATE TABLE IF NOT EXISTS nova_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 feature_key text NOT NULL,
 quantity numeric(16,4) NOT NULL,
 unit text NOT NULL,
 idempotency_key text NOT NULL,
 source text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}',
 UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS nova_billing_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 subscription_id uuid REFERENCES nova_subscriptions(id),
 event_type text NOT NULL,
 status text NOT NULL DEFAULT 'recorded',
 external_reference text,
 amount numeric(12,2),
 currency text,
 details jsonb NOT NULL DEFAULT '{}',
 occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_subscription_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 subscription_id uuid REFERENCES nova_subscriptions(id),
 event_type text NOT NULL,
 previous_status text,
 new_status text,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entitlements_tenant_feature
ON nova_entitlements(tenant_id,feature_key,status);

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_feature
ON nova_usage_events(tenant_id,feature_key,occurred_at);

CREATE INDEX IF NOT EXISTS idx_subscription_events_tenant
ON nova_subscription_events(tenant_id,created_at);
