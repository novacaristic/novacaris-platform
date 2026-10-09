CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS nova_billing_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_key text NOT NULL,
 version text NOT NULL,
 name text NOT NULL,
 product_type text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_key,version)
);

CREATE TABLE IF NOT EXISTS nova_billing_prices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES nova_billing_products(id),
 price_key text NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount >= 0),
 currency text NOT NULL DEFAULT 'USD',
 billing_interval text NOT NULL DEFAULT 'one_time',
 interval_count integer NOT NULL DEFAULT 1 CHECK(interval_count > 0),
 usage_model text NOT NULL DEFAULT 'flat',
 provider_price_reference text,
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(price_key)
);

CREATE TABLE IF NOT EXISTS nova_billing_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 customer_key text NOT NULL,
 organization_name text NOT NULL,
 billing_contact_reference text,
 provider_customer_reference text,
 billing_status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,customer_key)
);

CREATE TABLE IF NOT EXISTS nova_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 billing_customer_id uuid NOT NULL REFERENCES nova_billing_customers(id),
 subscription_key text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 provider_subscription_reference text,
 current_period_start timestamptz,
 current_period_end timestamptz,
 trial_end timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 canceled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,subscription_key)
);

CREATE TABLE IF NOT EXISTS nova_subscription_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL REFERENCES nova_subscriptions(id),
 price_id uuid NOT NULL REFERENCES nova_billing_prices(id),
 quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK(quantity >= 0),
 entitlement_reference text,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_usage_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 subscription_item_id uuid REFERENCES nova_subscription_items(id),
 usage_key text NOT NULL,
 quantity numeric(14,4) NOT NULL CHECK(quantity >= 0),
 unit text NOT NULL,
 occurred_at timestamptz NOT NULL,
 source_reference text NOT NULL,
 idempotency_key text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 rated_amount numeric(12,2),
 currency text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS nova_billing_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 billing_customer_id uuid NOT NULL REFERENCES nova_billing_customers(id),
 subscription_id uuid REFERENCES nova_subscriptions(id),
 invoice_key text NOT NULL,
 provider_invoice_reference text,
 status text NOT NULL DEFAULT 'draft',
 currency text NOT NULL DEFAULT 'USD',
 subtotal numeric(12,2) NOT NULL DEFAULT 0,
 tax_amount numeric(12,2) NOT NULL DEFAULT 0,
 total_amount numeric(12,2) NOT NULL DEFAULT 0,
 amount_paid numeric(12,2) NOT NULL DEFAULT 0,
 amount_due numeric(12,2) NOT NULL DEFAULT 0,
 issued_at timestamptz,
 due_at timestamptz,
 paid_at timestamptz,
 voided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,invoice_key)
);

CREATE TABLE IF NOT EXISTS nova_billing_invoice_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES nova_billing_invoices(id),
 description text NOT NULL,
 quantity numeric(12,3) NOT NULL DEFAULT 1,
 unit_amount numeric(12,2) NOT NULL,
 line_amount numeric(12,2) NOT NULL,
 price_reference uuid REFERENCES nova_billing_prices(id),
 usage_reference uuid REFERENCES nova_usage_records(id),
 metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS nova_billing_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 invoice_id uuid REFERENCES nova_billing_invoices(id),
 provider text NOT NULL,
 provider_event_reference text NOT NULL,
 provider_payment_reference text,
 event_type text NOT NULL,
 amount numeric(12,2),
 currency text,
 occurred_at timestamptz,
 received_at timestamptz NOT NULL DEFAULT now(),
 verified boolean NOT NULL DEFAULT false,
 details jsonb NOT NULL DEFAULT '{}',
 UNIQUE(provider,provider_event_reference)
);

CREATE TABLE IF NOT EXISTS nova_billing_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 invoice_id uuid REFERENCES nova_billing_invoices(id),
 adjustment_type text NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount >= 0),
 currency text NOT NULL DEFAULT 'USD',
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'requested',
 requested_by uuid,
 approved_by uuid,
 approved_at timestamptz,
 provider_reference text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nova_billing_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 provider text NOT NULL,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 internal_total numeric(14,2),
 provider_total numeric(14,2),
 discrepancy_count integer NOT NULL DEFAULT 0,
 discrepancy_summary jsonb NOT NULL DEFAULT '{}',
 reviewed_by uuid,
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS nova_billing_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 customer_id uuid REFERENCES nova_billing_customers(id),
 subscription_id uuid REFERENCES nova_subscriptions(id),
 invoice_id uuid REFERENCES nova_billing_invoices(id),
 event_type text NOT NULL,
 actor_type text NOT NULL,
 actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status
ON nova_subscriptions(tenant_id,status);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_due
ON nova_billing_invoices(tenant_id,status,due_at);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_occurred
ON nova_usage_records(tenant_id,occurred_at);

CREATE INDEX IF NOT EXISTS idx_billing_events_tenant
ON nova_billing_events(tenant_id,created_at);
