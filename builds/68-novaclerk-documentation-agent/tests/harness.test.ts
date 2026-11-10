import { describe, expect, it } from "vitest";
import { AGENT_CASES, GUARD_CASES, GOALS } from "./harness-cases";
import { DocumentationAgent, AnthropicProvider, parseDraftJson, AgentError } from "../src/agent";
import { guardDraft } from "../src/guard";
import { runHarness } from "../src/harness";

const agent = new DocumentationAgent();

describe("NovaClerk harness — documentation cases (A–C, agent end to end)", () => {
  for (const c of AGENT_CASES) {
    it(`${c.id} ${c.category} (${c.role})`, async () => {
      const r = await agent.run({ source: c.source, noteType: "progress", goals: GOALS });
      expect(r.guard.flags.filter(f => f.severity === "block")).toEqual([]);           // invents nothing
      const missing = r.coach.map(x => x.field);
      if (c.category === "A_straightforward") {
        expect(missing.filter(m => ["narrative","resident_response","plan_next_steps"].includes(m))).toEqual([]);
      }
      for (const m of c.expectMissing ?? []) expect(missing).toContain(m);              // flags what's missing
      const all = [r.draft.narrative, r.draft.resident_response, r.draft.plan_next_steps].filter(Boolean).join(" ");
      for (const re of c.mustKeep ?? []) expect(all).toMatch(re);                         // keeps uncertainty/quotes
    });
  }
});

describe("NovaClerk harness — fabrication, negation and quote challenges (D–E, guard)", () => {
  for (const c of GUARD_CASES) {
    it(`${c.id} ${c.category}: catches ${c.expectCode}; passes the faithful draft`, () => {
      const bad = guardDraft(c.source, c.badDraft);
      expect(bad.status).toBe("blocked");
      expect(bad.flags.map(f => f.code)).toContain(c.expectCode);
      const good = guardDraft(c.source, c.goodDraft);
      expect(good.flags.filter(f => f.severity === "block")).toEqual([]);
    });
  }
});

describe("NovaClerk harness — model provider safety", () => {
  it("S01 the LLM provider refuses to start without a signed BAA", () => {
    expect(() => new AnthropicProvider({ apiKey: "k", model: "m", baaConfirmed: false })).toThrow("AI_PROVIDER_BLOCKED_NO_BAA");
  });
  it("S02 the LLM provider refuses a non-HTTPS endpoint", () => {
    expect(() => new AnthropicProvider({ apiKey: "k", model: "m", baaConfirmed: true, endpoint: "http://example.test/v1" })).toThrow("AI_PROVIDER_INSECURE_ENDPOINT");
  });
  it("S03 model output cannot carry extra fields (e.g. a signature)", () => {
    expect(() => parseDraftJson('{"narrative":"x","authenticated_by":"someone"}')).toThrow(/UNEXPECTED_FIELD:authenticated_by/);
    expect(() => parseDraftJson("not json")).toThrow(AgentError);
  });
  it("S04 a fabricating model is caught end to end by the guard", async () => {
    const fake: typeof fetch = async () => new Response(JSON.stringify({ content: [{ type: "text",
      text: '{"narrative":"Checked vitals: BP 140/90. Resident took sertraline 100 mg.","resident_response":null,"plan_next_steps":null}' }] }), { status: 200 });
    const llm = new AnthropicProvider({ apiKey: "k", model: "test-model", baaConfirmed: true, fetchImpl: fake });
    const r = await new DocumentationAgent(llm).run({ source: "Checked vitals, all normal. Resident took evening medications.", noteType: "nursing" });
    expect(r.guard.status).toBe("blocked");
    expect(r.guard.flags.map(f => f.code)).toEqual(expect.arrayContaining(["INVENTED_NUMBER", "INVENTED_MEDICATION"]));
  });
});

describe("NovaClerk harness — gate", () => {
  it("overall gate is GO (zero-tolerance categories all pass)", async () => {
    const report = await runHarness();
    expect(report.gate).toBe("GO");
    expect(report.total).toBe(50);
    expect(report.passed).toBe(50);
  });
});
