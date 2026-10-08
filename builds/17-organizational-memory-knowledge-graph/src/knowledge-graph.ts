export interface GraphEntity {
  id: string;
  type: string;
  key: string;
}

export interface GraphRelationship {
  from: string;
  relationship: string;
  to: string;
  confidence?: number;
}

export interface GraphDependencies {
  upsertEntity(entity: GraphEntity): Promise<string>;
  upsertRelationship(relationship: GraphRelationship): Promise<void>;
  recordEvent(entityId: string, eventType: string, payload: Record<string, unknown>): Promise<void>;
}

export async function connectKnowledge(
  deps: GraphDependencies,
  entity: GraphEntity,
  relationships: GraphRelationship[],
): Promise<string> {
  const entityId = await deps.upsertEntity(entity);

  for (const relationship of relationships) {
    await deps.upsertRelationship({
      ...relationship,
      from: relationship.from || entityId,
    });
  }

  return entityId;
}
