BEGIN;
ALTER TABLE nova_agents.tasks ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE nova_agents.tasks ADD COLUMN IF NOT EXISTS approved_by text;
CREATE UNIQUE INDEX IF NOT EXISTS agent_tasks_tenant_idempotency_uq
  ON nova_agents.tasks(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_tasks_dispatch_idx
  ON nova_agents.tasks(status,created_at) WHERE status='QUEUED';
COMMIT;
