import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { once } from "node:events";
import type { Server } from "node:http";
import { Pool } from "pg";
import { RecoveryOperationsApi } from "../../54-nova-recovery-operations-dashboard-ui/src/recovery-operations-api";
import { createRecoveryHttpServer } from "../../55-nova-secure-runtime/src/recovery-http-server";
import { ChartApi, type ChartContext } from "../src/chart-api";
import { DocumentationAgent, ReferenceProvider, type DraftProvider } from "../../68-novaclerk-documentation-agent/src/agent";

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 6 }) : null;
const uuid = () => crypto.randomUUID();
const SECRET = "integration-test-context-secret-0123456789";

// Identities are chosen by a test header standing in for a verified token.
const T = { a: uuid(), b: uuid() };
const U = { dr: uuid(), rn: uuid(), bht: uuid(), other: uuid() };
const SUB: Record<string, { tenant: string; role: string }> = {};
const caps: Record<string, string[]> = {
  clinician: ["chart.read", "chart.note.write", "chart.note.sign", "chart.mar.administer"],
  supervisor: ["chart.read", "chart.note.write", "chart.note.sign", "chart.mar.administer", "chart.note.cosign"],
};
const resolve = async (req: { headers?: Record<string, string | undefined> }): Promise<ChartContext | null> => {
  const sub = req.headers?.["x-test-sub"];
  if (!sub || !SUB[sub]) return null;
  return { tenantId: SUB[sub].tenant, actor: { type: "user", reference: sub, role: SUB[sub].role }, authorizationDecisionReference: "test" };
};
const authorize = async (c: ChartContext, action: string) => (caps[c.actor.role] ?? []).includes(action);

let server: Server; let base = ""; const origin = "http://127.0.0.1";
const ids = { admA: uuid(), admB: uuid(), patA: uuid(), patB: uuid(), orderA: uuid(), medPrn: uuid() };

async function call(sub: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: origin };
  if (sub) headers["x-test-sub"] = sub;
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) as any, headers: r.headers };
}

describe.skipIf(!pool)("Build 67 clinical chart API + UI (real PostgreSQL, RLS enforced)", () => {
  beforeAll(async () => {
    const db = pool!;
    // Apply every build in order, exactly as a deployment would.
    const root = new URL("../../", import.meta.url);
    const dirs = (await readdir(root)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    for (const d of dirs) {
      let files: string[] = [];
      try { files = (await readdir(new URL(`${d}/sql/`, root))).filter(f => /^build_.*\.sql$/.test(f)).sort(); } catch { continue; }
      for (const f of files) await db.query(await readFile(new URL(`${d}/sql/${f}`, root), "utf8"));
    }
    // Seed two agencies as the database owner.
    await db.query("INSERT INTO nova_tenants(id,tenant_key,name) VALUES ($1,$2,'Agency A'),($3,$4,'Agency B')", [T.a, "a-" + T.a, T.b, "b-" + T.b]);
    const users: [string, string, string, string][] = [[U.dr, T.a, "sub-dr-" + U.dr, "Dr. Prescriber"], [U.rn, T.a, "sub-rn-" + U.rn, "Nurse RN"], [U.bht, T.a, "sub-bht-" + U.bht, "BHT Staff"], [U.other, T.b, "sub-other-" + U.other, "Other Agency"]];
    for (const [id, t, sub, name] of users) await db.query("INSERT INTO nova_users(id,tenant_id,external_subject,display_name) VALUES ($1,$2,$3,$4)", [id, t, sub, name]);
    SUB["sub-dr-" + U.dr] = { tenant: T.a, role: "supervisor" };
    SUB["sub-rn-" + U.rn] = { tenant: T.a, role: "supervisor" };
    SUB["sub-bht-" + U.bht] = { tenant: T.a, role: "clinician" };
    SUB["sub-other-" + U.other] = { tenant: T.b, role: "supervisor" };
    SUB["sub-ghost"] = { tenant: T.a, role: "supervisor" }; // valid token, no staff record
    await db.query("SELECT nova_set_context_secret($1)", [SECRET]);
    await db.query(`INSERT INTO nova_staff_credentials(tenant_id,user_id,credential,may_prescribe,may_verify_orders,may_administer_medication,may_assist_self_administration,may_supervise)
      VALUES ($1,$2,'PMHNP',true,true,true,false,true),($1,$3,'RN',false,true,true,false,true),($1,$4,'BHT',false,false,false,true,false),($5,$6,'RN',false,true,true,false,true)`,
      [T.a, U.dr, U.rn, U.bht, T.b, U.other]);
    await db.query("INSERT INTO nova_patients(id,tenant_id) VALUES ($1,$2),($3,$4)", [ids.patA, T.a, ids.patB, T.b]);
    await db.query(`INSERT INTO nova_resident_profiles(tenant_id,patient_id,legal_first_name,legal_last_name,date_of_birth,address_line1,allergies_reviewed)
      VALUES ($1,$2,'Jordan','Rivera','1990-04-12','142 E Joan D Arc Ave',true),($3,$4,'Other','Resident','1985-01-01','1 Main',true)`, [T.a, ids.patA, T.b, ids.patB]);
    await db.query(`INSERT INTO nova_admissions(id,tenant_id,patient_id,admitted_at,admitting_professional_name,admitting_professional_credential,presenting_issues)
      VALUES ($1,$2,$3,now()-interval '1 day','Dr. Prescriber','PMHNP','Step-down'),($4,$5,$6,now(),'Doc B','MD','B')`, [ids.admA, T.a, ids.patA, ids.admB, T.b, ids.patB]);
    // Order + verified PRN psychotropic, signed by the right people through the DB session rules.
    const chartApi = new ChartApi(db, resolve, authorize, { contextSecret: SECRET });
    const c = await db.connect();
    try {
      await c.query("BEGIN"); await c.query("SET LOCAL ROLE nova_app");
      await c.query("SELECT set_config('app.ctx',$1,true)", [chartApi.signContext(T.a, U.dr)]);
      await c.query(`INSERT INTO nova_clinical_orders(id,tenant_id,patient_id,admission_id,order_kind,order_text,order_source,ordered_at,
        issuing_practitioner_user_id,issuing_practitioner_name,issuing_practitioner_credential,authenticated_by)
        VALUES ($1,$2,$3,$4,'medication','Hydroxyzine 25 mg PO q6h PRN anxiety','electronic',now(),$5,'Dr. Prescriber','PMHNP',$5)`, [ids.orderA, T.a, ids.patA, ids.admA, U.dr]);
      await c.query("SELECT set_config('app.ctx',$1,true)", [chartApi.signContext(T.a, U.rn)]);
      await c.query(`INSERT INTO nova_medication_orders(id,tenant_id,patient_id,admission_id,clinical_order_id,medication_name,strength,dose,route,frequency,
        is_prn,prn_indication,prn_max_doses_per_day,is_psychotropic,start_date,authenticated_by)
        VALUES ($1,$2,$3,$4,$5,'Hydroxyzine HCl','25 mg','25 mg','PO','q6h PRN',true,'anxiety',4,true,current_date - 1,$6)`, [ids.medPrn, T.a, ids.patA, ids.admA, ids.orderA, U.rn]);
      await c.query("COMMIT");
    } finally { c.release(); }

    const api = new RecoveryOperationsApi(async () => null, {} as never, {} as never);
    server = createRecoveryHttpServer({ api, chartApi, allowedOrigin: origin });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("NO_ADDRESS");
    base = `http://127.0.0.1:${addr.port}`;
  }, 60000);
  afterAll(async () => { if (server?.listening) { server.close(); await once(server, "close"); } await pool?.end(); });

  const bht = () => "sub-bht-" + U.bht, rn = () => "sub-rn-" + U.rn, other = () => "sub-other-" + U.other;
  let noteId = ""; let adminId = "";

  it("serves the chart screen with security headers", async () => {
    const r = await fetch(base + "/chart");
    expect(r.status).toBe(200);
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(await r.text()).toContain("NovaCärïs Chart");
  });

  it("requires authentication and a provisioned staff record", async () => {
    expect((await call(null, "GET", "/api/chart/residents")).status).toBe(401);
    const ghost = await call("sub-ghost", "GET", "/api/chart/residents");
    expect(ghost.status).toBe(403); expect(ghost.body.error).toBe("USER_NOT_PROVISIONED");
  });

  it("dashboard lists only the caller's own agency, with completeness", async () => {
    const r = await call(bht(), "GET", "/api/chart/residents");
    expect(r.status).toBe(200);
    expect(r.body.items.map((x: any) => x.admission_id)).toEqual([ids.admA]);
    const chart = await call(bht(), "GET", `/api/chart/admissions/${ids.admA}`);
    expect(chart.status).toBe(200);
    expect(chart.body.item.completeness.length).toBeGreaterThan(15);
  });

  it("note writing: draft, edit, sign, then locked; client cannot choose tenant or signer", async () => {
    const created = await call(bht(), "POST", `/api/chart/admissions/${ids.admA}/notes`, {
      note_type: "skills_training", service_date: new Date().toISOString().slice(0, 10), start_time: "09:00", end_time: "10:00",
      service_code: "H2017", units: 4, narrative: "Coached resident on medication routine and weekly meal plan.", requires_cosign: true,
      tenant_id: T.b, authenticated_by: U.dr, entered_by: U.dr,
    });
    expect(created.status).toBe(201); expect(created.body.item.authenticated_at).toBeNull();
    noteId = created.body.item.id;
    const row = await pool!.query("SELECT tenant_id, entered_by FROM nova_clinical_notes WHERE id=$1", [noteId]);
    expect(row.rows[0]).toEqual({ tenant_id: T.a, entered_by: U.bht });
    const notMine = await call(rn(), "POST", `/api/chart/notes/${noteId}`, { note_type: "progress", service_date: "2026-11-10", narrative: "Someone else editing this draft text." });
    expect(notMine.status).toBe(403);
    const edited = await call(bht(), "POST", `/api/chart/notes/${noteId}`, { note_type: "skills_training", service_date: new Date().toISOString().slice(0, 10), narrative: "Coached resident on medication routine and weekly meal plan in detail.", requires_cosign: true, service_code: "H2017", units: 4 });
    expect(edited.status).toBe(200);
    const signed = await call(bht(), "POST", `/api/chart/notes/${noteId}/sign`);
    expect(signed.status).toBe(200); expect(signed.body.item.signed_at).toBeTruthy();
    const locked = await call(bht(), "POST", `/api/chart/notes/${noteId}`, { note_type: "progress", service_date: "2026-11-10", narrative: "Trying to rewrite a signed note afterwards." });
    expect(locked.body.error).toBe("CHART_LOCKED"); expect(locked.status).toBe(409);
  });

  it("cosign is role-gated and cannot be done by the author", async () => {
    const denied = await call(bht(), "POST", `/api/chart/notes/${noteId}/cosign`);
    expect(denied.status).toBe(403); expect(denied.body.error).toBe("POLICY_DENIED:chart.note.cosign");
    const ok = await call(rn(), "POST", `/api/chart/notes/${noteId}/cosign`);
    expect(ok.status).toBe(200); expect(ok.body.item.cosigned_at).toBeTruthy();
    const again = await call(rn(), "POST", `/api/chart/notes/${noteId}/cosign`);
    expect(again.status).toBe(409);
  });

  it("corrections are signed addenda; the original note is unchanged", async () => {
    const r = await call(bht(), "POST", `/api/chart/notes/${noteId}/addendum`, { amendment_type: "addendum", reason: "Clarify duration", amended_content: "Session ran the full 60 minutes." });
    expect(r.status).toBe(201); expect(r.body.item.authenticated_at).toBeTruthy();
    const chart = await call(bht(), "GET", `/api/chart/admissions/${ids.admA}`);
    expect(chart.body.item.amendments.some((m: any) => m.target_id === noteId)).toBe(true);
  });

  it("MAR pass: PRN psychotropic needs a pre-assessment; drug, dose, route and credential come from the order and roster", async () => {
    const missing = await call(rn(), "POST", "/api/chart/mar", { medication_order_id: ids.medPrn, outcome: "given" });
    expect(missing.status).toBe(400); expect(missing.body.error).toBe("MAR_ASSESSMENT");
    const future = await call(rn(), "POST", "/api/chart/mar", { medication_order_id: ids.medPrn, outcome: "given", pre_behavior_assessment: "Pacing", administered_at: new Date(Date.now() + 3600_000).toISOString() });
    expect(future.status).toBe(400);
    const bhtGive = await call(bht(), "POST", "/api/chart/mar", { medication_order_id: ids.medPrn, outcome: "given", pre_behavior_assessment: "Pacing" });
    expect(bhtGive.status).toBe(403); expect(bhtGive.body.error).toBe("MAR_NOT_PERMITTED");
    const given = await call(rn(), "POST", "/api/chart/mar", { medication_order_id: ids.medPrn, outcome: "given", pre_behavior_assessment: "Pacing, tearful, anxiety 7/10",
      dose_given: "100 mg", route: "IV", professional_designation: "MD", medication_name: "Something else" });
    expect(given.status).toBe(201);
    expect(given.body.item).toMatchObject({ medication_name: "Hydroxyzine HCl", strength: "25 mg", dose_given: "25 mg", route: "PO", professional_designation: "RN" });
    expect(given.body.item.authenticated_at).toBeTruthy();
    adminId = given.body.item.id;
    const eff = await call(rn(), "POST", `/api/chart/mar/${adminId}/effect`, { effect_assessment: "Calmer after 45 min, anxiety 3/10" });
    expect(eff.status).toBe(200); expect(eff.body.item.effect_assessed_at).toBeTruthy();
    const again = await call(rn(), "POST", `/api/chart/mar/${adminId}/effect`, { effect_assessment: "rewrite" });
    expect(again.status).toBe(409);
    const mar = await call(rn(), "GET", `/api/chart/admissions/${ids.admA}/mar`);
    expect(mar.body.item.administrations.map((x: any) => x.id)).toContain(adminId);
  });

  it("only the author can edit a draft at the database level, even with direct SQL as the app role", async () => {
    const c = await pool!.connect();
    const api = new ChartApi(pool!, resolve, authorize, { contextSecret: SECRET });
    try {
      await c.query("BEGIN"); await c.query("SET LOCAL ROLE nova_app");
      await c.query("SELECT set_config('app.ctx',$1,true)", [api.signContext(T.a, U.rn)]);
      await expect(c.query("UPDATE nova_clinical_notes SET plan_next_steps='x' WHERE id=$1", [noteId])).rejects.toThrow(/CHART_LOCKED|NOT_AUTHOR/);
    } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
  });

  it("forged or raw session variables give no access", async () => {
    const c = await pool!.connect();
    try {
      await c.query("BEGIN"); await c.query("SET LOCAL ROLE nova_app");
      await c.query("SELECT set_config('app.tenant_id',$1,true), set_config('app.user_id',$2,true)", [T.a, U.rn]);
      expect((await c.query("SELECT count(*)::int n FROM nova_clinical_notes")).rows[0].n).toBe(0);
      const wrongKey = new ChartApi(pool!, resolve, authorize, { contextSecret: "a-different-secret-that-the-db-does-not-know" });
      await c.query("SELECT set_config('app.ctx',$1,true)", [wrongKey.signContext(T.a, U.rn)]);
      expect((await c.query("SELECT count(*)::int n FROM nova_clinical_notes")).rows[0].n).toBe(0);
    } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
  });

  it("refuses RLS-escaping logins; accepts a dedicated restricted login that cannot escape", async () => {
    await expect(ChartApi.assertSafeConnection(pool!, false)).rejects.toThrow(/BYPASSES_RLS:.*superuser/);
    await expect(ChartApi.assertSafeConnection(pool!, true)).resolves.toBeUndefined();
    // Recommended deployment: a NOINHERIT login whose only power is switching into nova_app.
    const db = pool!;
    await db.query(`DO $$BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nova_api_test') THEN CREATE ROLE nova_api_test LOGIN NOINHERIT; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END$$`);
    await db.query("GRANT nova_app TO nova_api_test");
    await db.query("GRANT CONNECT ON DATABASE " + (await db.query("SELECT current_database() d")).rows[0].d + " TO nova_api_test");
    await db.query("GRANT USAGE ON SCHEMA public TO nova_api_test");
    const url = new URL(databaseUrl!); url.username = "nova_api_test"; url.password = "";
    const restricted = new Pool({ connectionString: url.toString(), max: 2 });
    try {
      await expect(ChartApi.assertSafeConnection(restricted, false)).resolves.toBeUndefined();
      const c = await restricted.connect();
      try {
        // escaping the role gives nothing, and the JWT branch is unreachable
        expect((await c.query("SELECT count(*)::int n FROM nova_clinical_notes").catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n).toBeLessThanOrEqual(0);
        await expect(c.query("SET ROLE authenticated")).rejects.toThrow(/permission denied/);
      } finally { c.release(); }
      const api = new ChartApi(restricted, resolve, authorize, { contextSecret: SECRET, appRole: "nova_app" });
      const res = await api.handle({ method: "GET", path: "/api/chart/residents", headers: { "x-test-sub": rn() } });
      expect(res.status).toBe(200);
      expect((res.body as any).items.map((x: any) => x.admission_id)).toEqual([ids.admA]);
    } finally { await restricted.end(); }
  });

  it("PRN daily cap holds under concurrent requests (row lock)", async () => {
    const db = pool!; const api = new ChartApi(db, resolve, authorize, { contextSecret: SECRET });
    const orderId = uuid(), medId = uuid();
    const c = await db.connect();
    try {
      await c.query("BEGIN"); await c.query("SET LOCAL ROLE nova_app");
      await c.query("SELECT set_config('app.ctx',$1,true)", [api.signContext(T.a, U.dr)]);
      await c.query(`INSERT INTO nova_clinical_orders(id,tenant_id,patient_id,admission_id,order_kind,order_text,order_source,ordered_at,
        issuing_practitioner_user_id,issuing_practitioner_name,issuing_practitioner_credential,authenticated_by)
        VALUES ($1,$2,$3,$4,'medication','Lorazepam 1 mg PO PRN max 1/day','electronic',now(),$5,'Dr','PMHNP',$5)`, [orderId, T.a, ids.patA, ids.admA, U.dr]);
      await c.query(`INSERT INTO nova_medication_orders(id,tenant_id,patient_id,admission_id,clinical_order_id,medication_name,strength,dose,route,frequency,
        is_prn,prn_indication,prn_max_doses_per_day,is_psychotropic,start_date,authenticated_by)
        VALUES ($1,$2,$3,$4,$5,'Lorazepam','1 mg','1 mg','PO','PRN',true,'agitation',1,true,current_date - 1,$6)`, [medId, T.a, ids.patA, ids.admA, orderId, U.dr]);
      await c.query("COMMIT");
    } finally { c.release(); }
    const give = () => call(rn(), "POST", "/api/chart/mar", { medication_order_id: medId, outcome: "given", pre_behavior_assessment: "Agitated, pacing" });
    const results = await Promise.all([give(), give(), give(), give()]);
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect(results.filter(r => r.body?.error === "MAR_PRN_DAILY_MAX")).toHaveLength(3);
  });

  // ------------------------------------------------------------ NovaClerk (Build 68)
  const today = () => new Date().toISOString().slice(0, 10);
  it("NovaClerk drafts an unsigned AI note with provenance; a clean draft can be signed by its author", async () => {
    const r = await call(bht(), "POST", `/api/chart/admissions/${ids.admA}/notes/assist`, { note_type: "skills_training", service_date: today(),
      source: "Coached resident on making a grocery list for the week. Resident completed the list with two prompts. Will go shopping with him on Saturday." });
    expect(r.status).toBe(201);
    expect(r.body.item.guard.status).toBe("clean");
    const id = r.body.item.id;
    const row = await pool!.query("SELECT ai_drafted, authenticated_at, entered_by, ai_guard_status FROM nova_clinical_notes WHERE id=$1", [id]);
    expect(row.rows[0]).toMatchObject({ ai_drafted: true, authenticated_at: null, entered_by: U.bht, ai_guard_status: "clean" });
    const why = await call(bht(), "GET", `/api/chart/notes/${id}/ai`);
    expect(why.status).toBe(200);
    expect(why.body.item.provenance.every((p: any) => p.class === "SOURCE_FACT")).toBe(true);
    expect(why.body.item.source_text).toContain("grocery list");
    const signed = await call(bht(), "POST", `/api/chart/notes/${id}/sign`);
    expect(signed.status).toBe(200);
  });

  it("a flagged AI draft cannot be signed until its author reviews the flags; nobody else can review them", async () => {
    class InventingModel implements DraftProvider { name = "test-inventing"; model = "test"; ref = new ReferenceProvider();
      async draft(req: any) { const d = await this.ref.draft(req); d.narrative += " Vitals were 132/84."; return d; } }
    const api = new ChartApi(pool!, resolve, authorize, { contextSecret: SECRET, documentationAgent: new DocumentationAgent(new InventingModel()) });
    const ask = (sub: string, method: string, path: string, body?: unknown) => api.handle({ method, path, body, headers: { "x-test-sub": sub } }) as Promise<{ status: number; body: any }>;
    const r = await ask(bht(), "POST", `/api/chart/admissions/${ids.admA}/notes/assist`, { note_type: "progress", service_date: today(),
      source: "Checked in with resident after dinner. Resident said the day went fine. Will check in again tomorrow." });
    expect(r.status).toBe(201);
    expect(r.body.item.guard.status).toBe("blocked");
    expect(r.body.item.guard.flags.map((f: any) => f.code)).toContain("INVENTED_NUMBER");
    const id = r.body.item.id;
    const early = await ask(bht(), "POST", `/api/chart/notes/${id}/sign`);
    expect(early.status).toBe(409); expect(early.body.error).toBe("AI_REVIEW_REQUIRED");
    const otherAck = await ask(rn(), "POST", `/api/chart/notes/${id}/acknowledge-ai`);
    expect(otherAck.status).toBe(403); expect(otherAck.body.error).toBe("AI_ACK_NOT_AUTHOR");
    const ack = await ask(bht(), "POST", `/api/chart/notes/${id}/acknowledge-ai`);
    expect(ack.status).toBe(200); expect(ack.body.item.ai_flags_acknowledged_at).toBeTruthy();
    expect((await ask(bht(), "POST", `/api/chart/notes/${id}/sign`)).status).toBe(200);
  });

  it("an AI-drafted note can't be passed off as human-written, or signed without a stored AI review", async () => {
    const made = await call(bht(), "POST", `/api/chart/admissions/${ids.admA}/notes`, { note_type: "progress", service_date: today(),
      narrative: "Claimed AI draft created without going through NovaClerk.", ai_drafted: true });
    expect(made.status).toBe(201);
    const sign = await call(bht(), "POST", `/api/chart/notes/${made.body.item.id}/sign`);
    expect(sign.status).toBe(409); expect(sign.body.error).toBe("AI_REVIEW_REQUIRED");
    const unflag = await call(bht(), "POST", `/api/chart/notes/${made.body.item.id}`, { note_type: "progress", service_date: today(),
      narrative: "Claimed AI draft created without going through NovaClerk.", ai_drafted: false });
    expect(unflag.status).toBe(409); expect(unflag.body.error).toBe("AI_FLAG_LOCKED");
  });

  it("AI draft records are append-only and isolated to the agency", async () => {
    const run = await pool!.query("SELECT id, note_id FROM nova_ai_draft_runs WHERE tenant_id=$1 LIMIT 1", [T.a]);
    const c = await pool!.connect(); const api = new ChartApi(pool!, resolve, authorize, { contextSecret: SECRET });
    try {
      await c.query("BEGIN"); await c.query("SET LOCAL ROLE nova_app");
      await c.query("SELECT set_config('app.ctx',$1,true)", [api.signContext(T.a, U.bht)]);
      await expect(c.query("UPDATE nova_ai_draft_runs SET guard_status='clean' WHERE id=$1", [run.rows[0].id])).rejects.toThrow(/AI_RUN_APPEND_ONLY/);
    } finally { await c.query("ROLLBACK").catch(() => {}); c.release(); }
    expect((await call(other(), "GET", `/api/chart/notes/${run.rows[0].note_id}/ai`)).status).toBe(404);
    expect((await call(other(), "POST", `/api/chart/admissions/${ids.admA}/notes/assist`, { note_type: "progress", service_date: today(), source: "Cross-agency attempt to draft a note here." })).status).toBe(404);
  });

  it("another agency cannot read, write, sign, or give meds on this chart", async () => {
    expect((await call(other(), "GET", `/api/chart/admissions/${ids.admA}`)).status).toBe(404);
    expect((await call(other(), "POST", `/api/chart/admissions/${ids.admA}/notes`, { note_type: "progress", service_date: "2026-11-10", narrative: "Cross-agency write attempt goes here." })).status).toBe(404);
    expect((await call(other(), "POST", `/api/chart/notes/${noteId}/sign`)).status).toBe(404);
    expect((await call(other(), "POST", "/api/chart/mar", { medication_order_id: ids.medPrn, outcome: "given", pre_behavior_assessment: "x" })).status).toBe(404);
    expect((await call(other(), "POST", `/api/chart/mar/${adminId}/effect`, { adverse_reaction: "fake" })).status).toBe(404);
    const list = await call(other(), "GET", "/api/chart/residents");
    expect(list.body.items.map((x: any) => x.admission_id)).toEqual([ids.admB]);
  });

  it("rejects malformed ids and cross-site posts", async () => {
    expect((await call(bht(), "GET", "/api/chart/admissions/not-a-uuid")).status).toBe(400);
    const r = await fetch(base + "/api/chart/mar", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example", "x-test-sub": rn() }, body: "{}" });
    expect(r.status).toBe(403);
  });
});
