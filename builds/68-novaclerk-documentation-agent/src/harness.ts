// Runs the 50-case NovaClerk documentation harness and applies the PILOT-10I gate.
// GO ≥ 95% with zero-tolerance categories clean · FIX ≥ 85% · HOLD below · STOP on any
// fabrication / negation-quote failure, whatever the total.
import { DocumentationAgent, type DraftProvider } from "./agent";
import { guardDraft } from "./guard";
import { AGENT_CASES, GUARD_CASES, GOALS } from "../tests/harness-cases";

export interface HarnessRow { id: string; category: string; role: string; pass: boolean; detail: string; }
export interface HarnessReport { gate: "GO" | "FIX" | "HOLD" | "STOP"; total: number; passed: number; byCategory: Record<string, { total: number; passed: number }>; rows: HarnessRow[]; provider: string; }

export async function runHarness(provider?: DraftProvider): Promise<HarnessReport> {
  const agent = new DocumentationAgent(provider);
  const rows: HarnessRow[] = [];
  for (const c of AGENT_CASES) {
    try {
      const r = await agent.run({ source: c.source, noteType: "progress", goals: GOALS });
      const blocks = r.guard.flags.filter(f => f.severity === "block");
      const missing = r.coach.map(x => x.field);
      const all = [r.draft.narrative, r.draft.resident_response, r.draft.plan_next_steps].filter(Boolean).join(" ");
      const problems = [
        ...blocks.map(b => `guard:${b.code}`),
        ...(c.category === "A_straightforward" ? missing.filter(m => ["narrative","resident_response","plan_next_steps"].includes(m)).map(m => `unexpected-missing:${m}`) : []),
        ...(c.expectMissing ?? []).filter(m => !missing.includes(m)).map(m => `not-flagged:${m}`),
        ...(c.mustKeep ?? []).filter(re => !re.test(all)).map(re => `lost:${re.source}`),
      ];
      rows.push({ id: c.id, category: c.category, role: c.role, pass: problems.length === 0, detail: problems.join("; ") || "ok" });
    } catch (e) { rows.push({ id: c.id, category: c.category, role: c.role, pass: false, detail: String(e) }); }
  }
  for (const c of GUARD_CASES) {
    const bad = guardDraft(c.source, c.badDraft), good = guardDraft(c.source, c.goodDraft);
    const caught = bad.status === "blocked" && bad.flags.some(f => f.code === c.expectCode);
    const clean = !good.flags.some(f => f.severity === "block");
    rows.push({ id: c.id, category: c.category, role: c.role, pass: caught && clean, detail: `${caught ? "caught " + c.expectCode : "MISSED " + c.expectCode}; faithful draft ${clean ? "passes" : "wrongly blocked"}` });
  }
  const byCategory: HarnessReport["byCategory"] = {};
  for (const r of rows) { const b = byCategory[r.category] ??= { total: 0, passed: 0 }; b.total++; if (r.pass) b.passed++; }
  const passed = rows.filter(r => r.pass).length, total = rows.length;
  // zero tolerance: the guard missing a fabrication (D/E), or a model draft that invented
  // something / lost a negative or an uncertainty (any guard block or "lost:" in A–C)
  const zeroTol = rows.filter(r => r.category.startsWith("D_") || r.category.startsWith("E_") || /guard:|lost:/.test(r.detail));
  const gate = zeroTol.some(r => !r.pass) ? "STOP" : passed / total >= 0.95 ? "GO" : passed / total >= 0.85 ? "FIX" : "HOLD";
  return { gate, total, passed, byCategory, rows, provider: provider?.name ?? "reference-extractive" };
}
