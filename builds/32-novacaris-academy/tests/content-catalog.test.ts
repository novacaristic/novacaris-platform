import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { publishableItems, validateContentCatalog, type ContentCatalog } from "../src/content-catalog";

const contentDir = join(dirname(fileURLToPath(import.meta.url)), "..", "content");
const catalog = JSON.parse(readFileSync(join(contentDir, "catalog.json"), "utf8")) as ContentCatalog;
const readFile = (file: string) => {
  const path = join(contentDir, file);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
};

describe("Build 32 content catalog", () => {
  it("is consistent with content governance", () => {
    expect(validateContentCatalog(catalog, readFile)).toEqual([]);
  });

  it("publishes nothing until a human reviewer approves it", () => {
    expect(publishableItems(catalog)).toEqual([]);
  });

  it("rejects an approved item with no reviewer", () => {
    const bad: ContentCatalog = {
      schemaVersion: 1,
      items: [{ ...catalog.items[0]!, approvalState: "approved", reviewer: null }],
    };
    expect(validateContentCatalog(bad, readFile)).toContain("APPROVED_WITHOUT_REVIEWER:ai-governance-in-practice");
  });
});
