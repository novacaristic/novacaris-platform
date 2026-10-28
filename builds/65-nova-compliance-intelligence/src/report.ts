// Read-only review page: gaps, approvals waiting for a person, trace and audit. Produces one self-contained HTML string.
import { NciEngine, NCI_DISCLAIMER, type NciSnapshot } from './nci-engine.js';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function renderReportHtml(snapshot: NciSnapshot, asOf: string): string {
  const engine = NciEngine.fromSnapshot(snapshot.tenantId, snapshot);
  const gaps = engine.analyze(asOf);
  const pending = engine.listProposals('pending');
  const openActions = snapshot.actions.filter((a) => a.status !== 'closed');
  const byRail = (rail: string) => snapshot.requirements.filter((r) => r.rail === rail);
  const open = new Set(gaps.map((g) => g.requirementId));
  const railRow = (rail: string, label: string) => {
    const reqs = byRail(rail);
    return `<tr><td>${esc(label)}</td><td>${reqs.length}</td><td>${reqs.filter((r) => open.has(r.id)).length}</td></tr>`;
  };
  const chain = engine.verifyAuditChain();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NovaCarïs Compliance Intelligence: review</title>
<style>body{font-family:Arial,sans-serif;margin:24px auto;max-width:980px;padding:0 16px;color:#111;background:#fff}h1{color:#0b1f3a}h2{border-bottom:2px solid #c99a2e;padding-bottom:4px;margin-top:32px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top;font-size:14px}th{background:#0b1f3a;color:#fff}.crit{color:#a00;font-weight:bold}.note{background:#fff7e0;border:1px solid #c99a2e;padding:10px;font-size:14px}</style></head><body>
<h1>NovaCarïs Compliance Intelligence</h1>
<p class="note">${esc(NCI_DISCLAIMER)} Read-only review as of ${esc(asOf)} for tenant ${esc(snapshot.tenantId)}.</p>
<h2>Summary by rail</h2><table><tr><th>Rail</th><th>Requirements</th><th>With open gaps</th></tr>${railRow('medical-regulatory', 'Medical and regulatory')}${railRow('financial', 'Financial')}${railRow('acquisition-retention', 'Acquisition and retention')}</table>
<h2>Open gaps (${gaps.length})</h2><table><tr><th>Severity</th><th>Requirement</th><th>Gap</th><th>Why</th></tr>${gaps.map((g) => `<tr><td class="${g.severity === 'critical' ? 'crit' : ''}">${esc(g.severity)}</td><td>${esc(g.requirementId)}</td><td>${esc(g.kind)}</td><td>${esc(g.explanation)}</td></tr>`).join('') || '<tr><td colspan="4">None</td></tr>'}</table>
<h2>Waiting for a person (${pending.length + openActions.filter((a) => a.status === 'proposed').length})</h2><table><tr><th>Type</th><th>Item</th><th>Detail</th></tr>${pending.map((p) => `<tr><td>Proposal (${esc(p.generatedBy)})</td><td>${esc(p.id)}</td><td>${esc(p.citation)}: ${esc(p.requirementText)}<br><i>Quote: ${esc(p.quote)}</i></td></tr>`).join('')}${openActions.filter((a) => a.status === 'proposed').map((a) => `<tr><td>Corrective action (draft)</td><td>${esc(a.id)}</td><td>${esc(a.plan)}</td></tr>`).join('')}</table>
<h2>Audit trail</h2><p>Chain check: ${chain.ok ? 'intact' : `BROKEN at event ${chain.brokenAt}`}. ${snapshot.audit.length} events.</p><table><tr><th>#</th><th>When</th><th>Who</th><th>What</th><th>Subject</th></tr>${snapshot.audit.slice(-25).reverse().map((e) => `<tr><td>${e.seq}</td><td>${esc(e.at)}</td><td>${esc(e.actor)}</td><td>${esc(e.action)}</td><td>${esc(e.subject)}</td></tr>`).join('')}</table>
</body></html>`;
}
