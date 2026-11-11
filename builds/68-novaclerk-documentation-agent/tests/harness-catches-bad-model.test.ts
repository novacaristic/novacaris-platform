import { it, expect } from "vitest";
import { runHarness } from "../src/harness";
import { ReferenceProvider, type DraftProvider } from "../src/agent";
class SloppyLLM implements DraftProvider { name = "sloppy"; model = null; inner = new ReferenceProvider();
  async draft(r: any) { const d = await this.inner.draft(r);
    d.narrative = d.narrative.replace(/\b(did not|denied|declined|refused|not) /i, "").replace(/\b(may have|possibly|appeared to|unclear if|might be)\b/i, "") + " Vitals 120/80.";
    return d; } }
it("H01 a fabricating, negation-dropping model fails the harness", async () => {
  const r = await runHarness(new SloppyLLM());
  expect(r.gate).toBe("STOP");
});
