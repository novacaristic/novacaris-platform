-- Real PostgreSQL integration assertions. Run after build_46_durable_execution.sql.
\set ON_ERROR_STOP on

BEGIN;
INSERT INTO nova_pilot_operations
  (tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'integration_test', 'atomic-success', 'fp-success', 'request-success', 'in_progress')
ON CONFLICT (tenant_id, operation_name, idempotency_key) DO NOTHING;

DO $$
DECLARE operation_uuid uuid;
BEGIN
  SELECT id INTO operation_uuid FROM nova_pilot_operations
   WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
     AND operation_name = 'integration_test' AND idempotency_key = 'atomic-success'
   FOR UPDATE;
  IF operation_uuid IS NULL THEN RAISE EXCEPTION 'operation reservation missing'; END IF;

  UPDATE nova_pilot_operations
     SET status = 'completed',
         result = '{"status":"completed","downstreamReference":"integration-ref","eventId":"integration-event"}'::jsonb,
         downstream_reference = 'integration-ref', event_id = 'integration-event', completed_at = now()
   WHERE id = operation_uuid;

  INSERT INTO nova_pilot_outbox
    (tenant_id, operation_id, event_id, event_type, event_version, correlation_id, payload)
  VALUES
    ('00000000-0000-4000-8000-000000000001', operation_uuid, 'integration-event',
     'pilot.operation.completed', '1.0', 'integration-correlation',
     '{"eventId":"integration-event","payload":{"fixture":"synthetic"}}'::jsonb);
END $$;
COMMIT;

DO $$
DECLARE operation_count integer; outbox_count integer;
BEGIN
  SELECT count(*) INTO operation_count FROM nova_pilot_operations
   WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
     AND operation_name = 'integration_test' AND idempotency_key = 'atomic-success' AND status = 'completed';
  SELECT count(*) INTO outbox_count FROM nova_pilot_outbox WHERE tenant_id = '00000000-0000-4000-8000-000000000001' AND event_id = 'integration-event';
  IF operation_count <> 1 OR outbox_count <> 1 THEN
    RAISE EXCEPTION 'atomic result/outbox check failed: operations %, outbox %', operation_count, outbox_count;
  END IF;
END $$;

-- A transaction that cannot persist the outbox must not persist a completed result.
BEGIN;
UPDATE nova_pilot_operations
   SET status = 'completed', result = '{"status":"completed"}'::jsonb
 WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
   AND operation_name = 'integration_test' AND idempotency_key = 'rollback-case';
INSERT INTO nova_pilot_operations
  (tenant_id, operation_name, idempotency_key, request_fingerprint, original_request_id, status)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'integration_test', 'rollback-case', 'fp-rollback', 'request-rollback', 'in_progress');
ROLLBACK;

DO $$
DECLARE operation_count integer;
BEGIN
  SELECT count(*) INTO operation_count FROM nova_pilot_operations
   WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
     AND operation_name = 'integration_test' AND idempotency_key = 'rollback-case';
  IF operation_count <> 0 THEN RAISE EXCEPTION 'rollback did not remove operation'; END IF;
END $$;
