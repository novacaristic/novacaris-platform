// Seeds a SAMPLE tenant (clearly fake data) so the review page has something to show.
// Usage: tsx scripts/demo-seed.ts <data-dir>
import { NciEngine } from '../src/nci-engine.js';
import { FileStore } from '../src/stores.js';

const dir = process.argv[2];
if (!dir) { console.error('usage: demo-seed <data-dir>'); process.exit(2); }
const e = new NciEngine('demo-tenant', () => '2026-11-01T00:00:00.000Z');
e.registerSource('ana', { id: 'SRC-SAMPLE', title: 'SAMPLE source (not real law)', jurisdiction: 'SAMPLE', effectiveDate: '2026-01-01', version: '1', contentHash: 'h1' });
e.approveSource('maria', 'SRC-SAMPLE');
const reqs: [string, string, 'medical-regulatory' | 'financial' | 'acquisition-retention', 'low' | 'medium' | 'high' | 'critical'][] = [
  ['REQ-1', 'SAMPLE: verify clinician credentials before service', 'medical-regulatory', 'critical'],
  ['REQ-2', 'SAMPLE: keep billing records for the required period', 'financial', 'high'],
  ['REQ-3', 'SAMPLE: marketing claims are reviewed before publishing', 'acquisition-retention', 'medium'],
];
for (const [id, text, rail, severity] of reqs) e.addRequirement('ana', { id, sourceId: 'SRC-SAMPLE', citation: `SAMPLE ${id}`, text, rail, severity });
e.addControl('ana', { id: 'C-1', requirementIds: ['REQ-1'], ownerId: 'ana', title: 'Credential check log', status: 'implemented' });
e.submitEvidence('ana', { id: 'EV-1', controlId: 'C-1', reference: 'credential-log.csv', reviewDate: '2026-10-30' });
e.reviewEvidence('maria', 'EV-1', 'approved');
e.addControl('ana', { id: 'C-2', requirementIds: ['REQ-2'], ownerId: 'ben', title: 'Billing record retention', status: 'in-progress' });
e.proposeCorrectiveActions('2026-11-01');
new FileStore(dir).save('demo-tenant', e.toSnapshot());
