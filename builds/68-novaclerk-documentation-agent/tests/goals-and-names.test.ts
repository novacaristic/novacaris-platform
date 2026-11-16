import { describe, it, expect } from "vitest";
import { DocumentationAgent, ReferenceProvider, suggestGoals, parseDraftJson } from "../src/agent";
import { GOALS } from "./harness-cases";

const [G1, G2] = GOALS;

describe("NovaClerk goal links are suggestions that staff confirm", () => {
  it("never sets a goal link on the draft itself", async () => {
    const r = await new DocumentationAgent().run({ source: "Coached Jordan on his morning medication routine using the checklist. He completed all steps.", noteType: "progress", goals: GOALS });
    expect(r.draft.treatment_plan_goal_ids).toEqual([]);
    expect(r.draft.suggested_goal_ids).toEqual([G1.id]);
    expect(r.coach.find(c => c.field === "treatment_plan_goal_ids")?.message).toMatch(/suggests Goal 1.*Confirm/);
  });
  it("one shared word is not enough (the old false link)", () => {
    expect(suggestGoals("Reviewed medication side effects with resident. She reported mild dry mouth.", GOALS)).toEqual([]);
  });
  it("two key words, or an explicit goal number, are enough", () => {
    expect(suggestGoals("Facilitated a coping skills group on grounding.", GOALS)).toEqual([G2.id]);
    expect(suggestGoals("Worked on goal #2 today.", GOALS)).toEqual([G2.id]);
    expect(suggestGoals("Worked on goal 12 today.", GOALS)).toEqual([]);
  });
  it("a model cannot add goals that are not in the resident's plan", async () => {
    const rogue = { name: "rogue", model: null, async draft() {
      return { narrative: "Provided coaching on routines today.", resident_response: null, plan_next_steps: null,
        treatment_plan_goal_ids: [G1.id], suggested_goal_ids: ["00000000-0000-4000-8000-0000000000ff"] }; } };
    const r = await new DocumentationAgent(rogue).run({ source: "Provided coaching on routines today.", noteType: "progress", goals: GOALS });
    expect(r.draft.treatment_plan_goal_ids).toEqual([]);
    expect(r.draft.suggested_goal_ids).toEqual([]);
  });
  it("LLM output never carries goal links", () => {
    expect(parseDraftJson('{"narrative":"Provided coaching."}').suggested_goal_ids).toEqual([]);
  });
});

describe("NovaClerk resident first-name matching is whole-word", () => {
  const p = new ReferenceProvider();
  it("a resident named Al does not match a sentence starting 'Also'", async () => {
    const d = await p.draft({ source: "Facilitated a budgeting session. Also reviewed the bus schedule with the group.", noteType: "progress", residentFirstName: "Al" });
    expect(d.resident_response).toBeNull();
  });
  it("still matches the resident's name as a whole word", async () => {
    const d = await p.draft({ source: "Facilitated a budgeting session. Al said he understood the budget.", noteType: "progress", residentFirstName: "Al" });
    expect(d.resident_response).toBe("Al said he understood the budget.");
  });
  it("names with regex characters are safe", async () => {
    const d = await p.draft({ source: "Facilitated a session. Mary-Jo stated she felt calm.", noteType: "progress", residentFirstName: "Mary-Jo" });
    expect(d.resident_response).toBe("Mary-Jo stated she felt calm.");
    await expect(p.draft({ source: "Facilitated a session. She stated she felt calm.", noteType: "progress", residentFirstName: "D (J" })).resolves.toBeTruthy();
  });
});
