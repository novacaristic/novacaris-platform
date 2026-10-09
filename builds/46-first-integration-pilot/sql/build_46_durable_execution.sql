-- Build 46 durable execution / recovery schema.
-- Apply after Builds 01-21 foundation migrations in the documented migration order.
-- This migration defines persistence contracts; production activation requires a
-- reviewed migration run and a concrete PostgreSQL PilotOperationStore adapter.

CREATE TABLE IF NOT EXISTS nova_pilot_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  operation_name text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  original_request_id text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'in_progress', 'completed', 'denied', 'failed_retryable', 'reconciliation_required'
  )),
  result jsonb,
  downstream_reference text,
  event_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, operation_name, idempotency_key)
);

CREATE TABLE IF NOT EXISTS nova_pilot_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  operation_id uuid NOT NULL REFERENCES nova_pilot_operations(id) ON DELETE RESTRICT,
  event_id text NOT NULL,
  event_type text NOT NULL,
  event_version text NOT NULL,
  correlation_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'delivered', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  lease_owner text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (tenant_id, event_id),
  UNIQUE (operation_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_nova_pilot_outbox_dispatch
  ON nova_pilot_outbox(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'delivering');

CREATE INDEX IF NOT EXISTS idx_nova_pilot_operations_reconciliation
  ON nova_pilot_operations(tenant_id, status, updated_at)
  WHERE status = 'reconciliation_required';

CREATE INDEX IF NOT EXISTS idx_nova_pilot_operations_request
  ON nova_pilot_operations(tenant_id, original_request_id);

-- Application transaction contract:
-- 1. INSERT nova_pilot_operations with ON CONFLICT DO NOTHING; then SELECT the
--    existing row FOR UPDATE and compare request_fingerprint.
-- 2. Only the transaction that creates the reservation may execute the adapter.
-- 3. After downstream success, UPDATE operation result/status and INSERT outbox
--    event in the SAME transaction. Never call an external event sink as the
--    only durable record.
-- 4. An outbox dispatcher leases pending rows with FOR UPDATE SKIP LOCKED,
--    delivers idempotently, and marks delivered. Failed delivery increments
--    attempt_count and applies bounded exponential backoff.
-- 5. An ambiguous downstream timeout is NOT a safe retry. Mark reconciliation
--    required until a downstream idempotency lookup or authorized human review
--    resolves the outcome.

-- Upgrade existing pilot installations safely.
ALTER TABLE nova_pilot_outbox ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE nova_pilot_outbox ADD COLUMN IF NOT EXISTS lease_until timestamptz;
