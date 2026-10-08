export interface OrganizationScopedDatabase { query<T>(sql: string, parameters?: readonly unknown[]): Promise<T[]>; }

export function organizationContextSql(organizationId: string): { sql: string; parameters: [string] } {
  if (!organizationId) throw new Error("Organization ID is required.");
  return { sql: "SELECT set_config('app.organization_id', $1, true)", parameters: [organizationId] };
}

export async function withOrganizationScope<T>(db: OrganizationScopedDatabase, organizationId: string, operation: () => Promise<T>): Promise<T> {
  const context = organizationContextSql(organizationId);
  await db.query(context.sql, context.parameters);
  return operation();
}
