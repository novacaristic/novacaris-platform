// Usage: tsx scripts/nci-report.ts <tenant-id> <data-dir> <as-of-date> > report.html
import { FileStore } from '../src/stores.js';
import { renderReportHtml } from '../src/report.js';

const [tenantId, dir, asOf] = process.argv.slice(2);
if (!tenantId || !dir || !asOf) {
  console.error('usage: nci-report <tenant-id> <data-dir> <as-of-YYYY-MM-DD>');
  process.exit(2);
}
const snap = new FileStore(dir).load(tenantId);
if (!snap) {
  console.error('no data for that tenant');
  process.exit(1);
}
process.stdout.write(renderReportHtml(snap, asOf));
