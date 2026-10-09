-- Synthetic case only. Never use real patient identifiers in this local demo.
INSERT INTO nova_workspace_cases (id, tenant_id, status)
VALUES ('62000000-0000-4000-8000-000000000062','62000000-0000-4000-8000-000000000001','active')
ON CONFLICT (tenant_id,id) DO NOTHING;
