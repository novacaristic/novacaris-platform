import { describe, expect, it } from "vitest";
import { connectKnowledge } from "../src/knowledge-graph";

describe("Build 17 organizational knowledge graph", () => {
  it("creates an entity and its relationships", async () => {
    const relationships: Array<{from:string; relationship:string; to:string}> = [];

    const id = await connectKnowledge(
      {
        upsertEntity: async () => "entity-1",
        upsertRelationship: async relationship => {
          relationships.push(relationship);
        },
        recordEvent: async () => {},
      },
      { id: "", type: "requirement", key: "REQ-001" },
      [
        { from: "entity-1", relationship: "SUPPORTED_BY", to: "evidence-1" },
      ],
    );

    expect(id).toBe("entity-1");
    expect(relationships).toHaveLength(1);
    expect(relationships[0].relationship).toBe("SUPPORTED_BY");
  });

  it("preserves relationship direction", async () => {
    let seen: {from:string; relationship:string; to:string} | undefined;

    await connectKnowledge(
      {
        upsertEntity: async () => "entity-2",
        upsertRelationship: async relationship => { seen = relationship; },
        recordEvent: async () => {},
      },
      { id: "", type: "finding", key: "F-001" },
      [
        { from: "finding-1", relationship: "ADDRESSED_BY", to: "action-1" },
      ],
    );

    expect(seen?.from).toBe("finding-1");
    expect(seen?.to).toBe("action-1");
  });
});
