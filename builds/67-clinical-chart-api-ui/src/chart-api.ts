// Build 67 — Clinical Chart API (note writing, MAR pass, chart dashboard)
// Sits on Build 65 (chart tables) and Build 66 (row-level security).
//
// Security model
//  * Identity comes only from the host security adapter (verified token).
//  * Every request runs in its own transaction as the restricted app role,
//    with a short-lived HMAC-signed context (app.ctx) that the database
//    verifies with a secret app users cannot read. Setting session variables
//    by hand therefore cannot impersonate another tenant or user.
//  * The Nova user id is looked up from the token subject inside the tenant;
//    nothing the client sends can choose the tenant or the acting user.
//  * Only whitelisted fields are accepted; tenant_id, patient_id,
//    signatures and timestamps are always set server-side.
import type { Pool, PoolClient } from "pg";
import { createHmac } from "node:crypto";

export interface ChartContext {
  tenantId: string;
  actor: { type: "user" | "agent" | "service"; reference: string; role: string };
  authorizationDecisionReference: string;
}
export interface ChartRequest { method: string; path: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string | undefined>; }
export interface ChartResponse { status: number; body: unknown; }
export type ChartContextResolver = (request: ChartRequest) => Promise<ChartContext | null>;
export type ChartPolicy = (context: ChartContext, action: string) => Promise<boolean>;

export class ChartError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); this.name = "ChartError"; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

const NOTE_TYPES = new Set(["progress","shift","individual_counseling","group_counseling","nursing","psychiatric","case_management","skills_training","health_service","interval","contact","other"]);
const MAR_OUTCOMES = new Set(["given","self_administered_with_assistance","refused","held","missed","not_available"]);

function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ChartError("REQUEST_BODY_INVALID");
  return v as Record<string, unknown>;
}
function str(b: Record<string, unknown>, k: string, opts: { required?: boolean; max?: number; pattern?: RegExp } = {}): string | null {
  const v = b[k];
  if (v === undefined || v === null || v === "") {
    if (opts.required) throw new ChartError("FIELD_REQUIRED:" + k);
    return null;
  }
  if (typeof v !== "string") throw new ChartError("FIELD_INVALID:" + k);
  const t = v.trim();
  if (opts.required && !t) throw new ChartError("FIELD_REQUIRED:" + k);
  if (t.length > (opts.max ?? 8000)) throw new ChartError("FIELD_TOO_LONG:" + k);
  if (opts.pattern && t && !opts.pattern.test(t)) throw new ChartError("FIELD_INVALID:" + k);
  return t || null;
}
function num(b: Record<string, unknown>, k: string): number | null {
  const v = b[k];
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10000) throw new ChartError("FIELD_INVALID:" + k);
  return n;
}
function bool(b: Record<string, unknown>, k: string): boolean {
  const v = b[k];
  if (v === undefined || v === null) return false;
  if (typeof v !== "boolean") throw new ChartError("FIELD_INVALID:" + k);
  return v;
}
function uuidList(b: Record<string, unknown>, k: string): string[] {
  const v = b[k];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 50 || !v.every(x => typeof x === "string" && UUID.test(x))) throw new ChartError("FIELD_INVALID:" + k);
  return v as string[];
}
function id(v: string | undefined): string {
  if (!v || !UUID.test(v)) throw new ChartError("ID_INVALID", 400);
  return v.toLowerCase();
}

// Map database errors to safe API errors. Only our own raised codes pass through.
const KNOWN = /^(NOTE_GOAL_INVALID|ORDER_[A-Z_]+|CHART_LOCKED|CHART_IDENTITY|CHART_TRANSITION|SIGNATURE_NOT_OWN|SIGN_NOT_AUTHOR|NOT_AUTHOR|NOT_SIGNABLE|NO_SESSION_USER|COSIGN_[A-Z_]+|ORDER_AUTH[A-Z_]*|MAR_[A-Z_]+|MEDORDER_[A-Z_]+|AMENDMENT_[A-Z_]+|WRONG_RESIDENT|DISCHARGE_[A-Z_]+|ADMISSION_NOT_FOUND_OR_NOT_VISIBLE)\b/;
export function mapError(e: unknown): ChartResponse {
  if (e instanceof ChartError) return { status: e.status, body: { error: e.code } };
  const err = e as { message?: string; code?: string };
  const msg = typeof err?.message === "string" ? err.message : "";
  const m = msg.match(KNOWN);
  if (m) {
    const code = m[1];
    const status = /SIGNATURE_NOT_OWN|ORDER_AUTH|COSIGN_SELF|COSIGN_NOT_SUPERVISOR|NOT_AUTHOR|MAR_NOT_PERMITTED|MEDORDER_NOT_PERMITTED|AMENDMENT_NOT_AUTHOR|DISCHARGE_NOT_PERMITTED|ORDER_DISCONTINUE_NOT_PERMITTED/.test(code) ? 403
      : /NOT_FOUND|NOT_SIGNABLE/.test(code) ? 404
      : /CHART_LOCKED|CHART_IDENTITY|CHART_TRANSITION|COSIGN_BEFORE_SIGN|COSIGN_FORGED|MAR_PRN_DAILY_MAX/.test(code) ? 409
      : 400;
    return { status, body: { error: code } };
  }
  if (err?.code === "42501" || /row-level security/i.test(msg)) return { status: 403, body: { error: "FORBIDDEN" } };
  if (err?.code === "23514" || err?.code === "23502") return { status: 400, body: { error: "VALIDATION_FAILED" } };
  if (err?.code === "23503") return { status: 400, body: { error: "REFERENCE_INVALID" } };
  if (err?.code === "22P02" || err?.code === "22007" || err?.code === "22008") return { status: 400, body: { error: "VALUE_INVALID" } };
  if (process.env.NOVA_DEBUG_ERRORS === "1") console.error("chart_api_500", e);
  return { status: 500, body: { error: "INTERNAL_SERVER_ERROR" } };
}

export interface ChartApiOptions { appRole?: string; contextSecret?: string; contextTtlSeconds?: number; }
const NIL = "00000000-0000-0000-0000-000000000000";

export class ChartApi {
  private readonly appRole: string | null;
  private readonly secret: string;
  private readonly ttl: number;
  constructor(
    private readonly pool: Pool,
    private readonly resolveContext: ChartContextResolver,
    private readonly authorize: ChartPolicy,
    options: ChartApiOptions = {},
  ) {
    const role = options.appRole ?? process.env.NOVA_DB_APP_ROLE ?? "nova_app";
    // "none" = the pool already logs in as a restricted role (recommended for production)
    if (role !== "none" && !ROLE_NAME.test(role)) throw new Error("STARTUP_BLOCKED_INVALID_APP_ROLE");
    this.appRole = role === "none" ? null : role;
    const secret = options.contextSecret ?? process.env.NOVA_CONTEXT_SECRET ?? "";
    if (secret.length < 32) throw new Error("STARTUP_BLOCKED_NOVA_CONTEXT_SECRET_TOO_SHORT");
    this.secret = secret;
    this.ttl = Math.min(Math.max(options.contextTtlSeconds ?? 120, 10), 900);
  }

  /** Signed session context the database verifies (see build_65 nova_verified_context). */
  signContext(tenantId: string, userId: string): string {
    const exp = Math.floor(Date.now() / 1000) + this.ttl;
    const payload = `v1.${tenantId.toLowerCase()}.${userId.toLowerCase()}.${exp}`;
    return `${payload}.${createHmac("sha256", this.secret).update(payload).digest("hex")}`;
  }

  /**
   * Refuse to serve chart requests over a database login that could escape the
   * restricted role: superuser / BYPASSRLS, the PostgREST "authenticator" login,
   * any member of "authenticated" (could switch to the JWT branch), or a login
   * that owns tables (owners skip RLS). Use a dedicated login, e.g.
   *   CREATE ROLE nova_api LOGIN PASSWORD '...' NOINHERIT IN ROLE nova_app;
   * and NOVA_DB_APP_ROLE=nova_app (or NOVA_DB_APP_ROLE=none with GRANT nova_app TO nova_api INHERIT).
   * NOVA_ALLOW_PRIVILEGED_DB_LOGIN=true is for local tests only.
   */
  static async assertSafeConnection(pool: Pool, allowPrivileged = process.env.NOVA_ALLOW_PRIVILEGED_DB_LOGIN === "true"): Promise<void> {
    const r = await pool.query(`SELECT r.rolsuper, r.rolbypassrls, r.rolname,
        EXISTS (SELECT 1 FROM pg_roles a WHERE a.rolname = 'authenticated' AND pg_has_role(r.oid, a.oid, 'MEMBER')) AS can_become_authenticated,
        EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relowner = r.oid) AS owns_tables
      FROM pg_roles r WHERE r.rolname = session_user`);
    const row = r.rows[0] ?? {};
    const problems = [
      row.rolsuper && "superuser", row.rolbypassrls && "bypassrls", row.rolname === "authenticator" && "authenticator_login",
      row.can_become_authenticated && "member_of_authenticated", row.owns_tables && "owns_tables",
    ].filter(Boolean);
    if (problems.length && !allowPrivileged) {
      throw new Error(`STARTUP_BLOCKED_DATABASE_LOGIN_BYPASSES_RLS:${problems.join(",")}: connect the API with a dedicated restricted login`);
    }
  }

  /** Run fn inside a transaction as the app role with tenant + user bound. */
  private async session<T>(c: ChartContext, fn: (db: PoolClient) => Promise<T>): Promise<T> {
    if (!c?.tenantId || !UUID.test(c.tenantId) || !c.actor?.reference) throw new ChartError("AUTH_CONTEXT_REQUIRED", 401);
    if (c.actor.type !== "user") throw new ChartError("HUMAN_ACTOR_REQUIRED", 403);
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      if (this.appRole) await db.query(`SET LOCAL ROLE ${this.appRole}`);
      // 1) tenant-only context to resolve the staff record from the token subject
      await db.query("SELECT set_config('app.ctx', $1, true)", [this.signContext(c.tenantId, NIL)]);
      const u = await db.query("SELECT id FROM nova_users WHERE external_subject = $1 AND status = 'active'", [c.actor.reference]);
      if (u.rowCount !== 1) throw new ChartError("USER_NOT_PROVISIONED", 403);
      // 2) full context bound to that user
      await db.query("SELECT set_config('app.ctx', $1, true)", [this.signContext(c.tenantId, u.rows[0].id)]);
      const result = await fn(db);
      await db.query("COMMIT");
      return result;
    } catch (e) {
      try { await db.query("ROLLBACK"); } catch { /* connection already broken */ }
      throw e;
    } finally {
      db.release();
    }
  }

  private async require(c: ChartContext, action: string): Promise<void> {
    if (!(await this.authorize(c, action))) throw new ChartError("POLICY_DENIED:" + action, 403);
  }

  async handle(req: ChartRequest): Promise<ChartResponse> {
    try {
      const c = await this.resolveContext(req);
      if (!c) return { status: 401, body: { error: "AUTHENTICATION_REQUIRED" } };
      const path = req.path.replace(/\/+$/, "") || "/";
      const parts = path.split("/").filter(Boolean); // ["api","chart",...]
      if (parts[0] !== "api" || parts[1] !== "chart") return { status: 404, body: { error: "ROUTE_NOT_FOUND" } };
      const r = parts.slice(2);
      const M = req.method.toUpperCase();

      if (M === "GET" && r.length === 1 && r[0] === "me") {
        await this.require(c, "chart.read");
        return { status: 200, body: { item: await this.session(c, db => this.me(db)) } };
      }
      if (M === "GET" && r.length === 1 && r[0] === "residents") {
        await this.require(c, "chart.read");
        return { status: 200, body: { items: await this.session(c, db => this.residents(db)) } };
      }
      if (r[0] === "admissions" && r.length >= 2) {
        const admissionId = id(r[1]);
        if (M === "GET" && r.length === 2) {
          await this.require(c, "chart.read");
          return { status: 200, body: { item: await this.session(c, db => this.chart(db, admissionId)) } };
        }
        if (M === "GET" && r.length === 3 && r[2] === "mar") {
          await this.require(c, "chart.read");
          const date = req.query?.date ?? new Date().toISOString().slice(0, 10);
          if (!DATE.test(date)) throw new ChartError("FIELD_INVALID:date");
          return { status: 200, body: { item: await this.session(c, db => this.mar(db, admissionId, date)) } };
        }
        if (M === "POST" && r.length === 3 && r[2] === "notes") {
          await this.require(c, "chart.note.write");
          return { status: 201, body: { item: await this.session(c, db => this.createNote(db, c, admissionId, obj(req.body))) } };
        }
      }
      if (r[0] === "notes" && r.length >= 2) {
        const noteId = id(r[1]);
        if (M === "POST" && r.length === 2) {
          await this.require(c, "chart.note.write");
          return { status: 200, body: { item: await this.session(c, db => this.updateNote(db, noteId, obj(req.body))) } };
        }
        if (M === "POST" && r[2] === "sign") {
          await this.require(c, "chart.note.sign");
          return { status: 200, body: { item: await this.session(c, db => this.signNote(db, noteId)) } };
        }
        if (M === "POST" && r[2] === "cosign") {
          await this.require(c, "chart.note.cosign");
          return { status: 200, body: { item: await this.session(c, db => this.cosignNote(db, noteId)) } };
        }
        if (M === "POST" && r[2] === "addendum") {
          await this.require(c, "chart.note.sign");
          return { status: 201, body: { item: await this.session(c, db => this.addendum(db, noteId, obj(req.body))) } };
        }
      }
      if (M === "POST" && r[0] === "mar" && r.length === 1) {
        await this.require(c, "chart.mar.administer");
        return { status: 201, body: { item: await this.session(c, db => this.administer(db, obj(req.body))) } };
      }
      if (M === "POST" && r[0] === "mar" && r.length === 3 && r[2] === "effect") {
        await this.require(c, "chart.mar.administer");
        const adminId = id(r[1]);
        return { status: 200, body: { item: await this.session(c, db => this.effect(db, adminId, obj(req.body))) } };
      }
      return { status: 404, body: { error: "ROUTE_NOT_FOUND" } };
    } catch (e) {
      return mapError(e);
    }
  }

  // ---------------------------------------------------------------- reads
  private async me(db: PoolClient) {
    const r = await db.query("SELECT u.id, u.display_name, t.name AS agency FROM nova_users u JOIN nova_tenants t ON t.id = u.tenant_id WHERE u.id = nova_current_user()");
    return r.rows[0] ?? null;
  }

  private async residents(db: PoolClient) {
    const r = await db.query(`SELECT admission_id, patient_id, resident_name, status, admitted_at, items_missing, items_unsigned
      FROM nova_chart_status WHERE status IN ('pending','active') ORDER BY resident_name NULLS LAST, admitted_at LIMIT 500`);
    return r.rows;
  }

  private async chart(db: PoolClient, admissionId: string) {
    const a = await db.query(`SELECT a.id, a.patient_id, a.status, a.admitted_at, a.discharged_at, a.admitting_professional_name,
        a.admitting_professional_credential, a.admitting_diagnoses, a.presenting_issues, a.level_of_care, a.authenticated_at,
        p.legal_first_name, p.legal_last_name, p.preferred_name, p.date_of_birth, p.ahcccs_member_id, p.allergies_reviewed
      FROM nova_admissions a LEFT JOIN nova_resident_profiles p ON p.patient_id = a.patient_id WHERE a.id = $1`, [admissionId]);
    if (a.rowCount !== 1) throw new ChartError("ADMISSION_NOT_FOUND", 404);
    const pid = a.rows[0].patient_id;
    // one connection runs one query at a time
    const allergies = await db.query("SELECT allergen, allergy_type, reaction, severity FROM nova_resident_allergies WHERE patient_id = $1 AND status = 'active' ORDER BY allergen", [pid]);
    const completeness = await db.query("SELECT * FROM nova_chart_completeness($1)", [admissionId]);
    const notes = await db.query(`SELECT n.id, n.note_type, n.service_date, n.start_time, n.end_time, n.location, n.service_code, n.units, n.narrative,
          n.resident_response, n.plan_next_steps, n.treatment_plan_goal_ids, n.ai_drafted, n.requires_cosign,
          n.entered_by, eu.display_name AS author_name, n.created_at, n.authenticated_at,
          n.cosigned_at, cu.display_name AS cosigner_name, (n.entered_by = nova_current_user()) AS mine,
          q.late_entry
        FROM nova_clinical_notes n
        LEFT JOIN nova_users eu ON eu.id = n.entered_by
        LEFT JOIN nova_users cu ON cu.id = n.cosigned_by
        LEFT JOIN nova_note_queue q ON q.note_id = n.id
        WHERE n.admission_id = $1 ORDER BY n.service_date DESC, n.created_at DESC LIMIT 100`, [admissionId]);
    const goals = await db.query(`SELECT g.id, g.goal_number, g.goal, g.measurable_objective FROM nova_treatment_plan_goals g
        JOIN nova_treatment_plans t ON t.id = g.treatment_plan_id WHERE t.admission_id = $1 AND t.status = 'active' AND g.status = 'active'
        ORDER BY g.goal_number`, [admissionId]);
    const amendments = await db.query(`SELECT m.id, m.target_id, m.amendment_type, m.reason, m.amended_content, m.created_at, u.display_name AS author_name
        FROM nova_chart_amendments m LEFT JOIN nova_users u ON u.id = m.entered_by
        WHERE m.patient_id = $1 AND m.target_table = 'nova_clinical_notes' ORDER BY m.created_at DESC LIMIT 300`, [pid]);
    return { admission: a.rows[0], allergies: allergies.rows, completeness: completeness.rows, notes: notes.rows, goals: goals.rows, amendments: amendments.rows };
  }

  private async mar(db: PoolClient, admissionId: string, date: string) {
    const orders = await db.query(`SELECT id, medication_name, strength, dose, route, frequency, scheduled_times, is_prn, prn_indication,
        prn_max_doses_per_day, is_psychotropic, is_pain_medication, status, (authenticated_at IS NOT NULL) AS verified
      FROM nova_medication_orders WHERE admission_id = $1 AND status = 'active'
        AND start_date <= $2::date AND (stop_date IS NULL OR stop_date >= $2::date)
      ORDER BY is_prn, medication_name`, [admissionId, date]);
    const given = await db.query(`SELECT m.id, m.medication_order_id, m.scheduled_for, m.administered_at, m.outcome, m.dose_given, m.route,
        m.reason_not_given, m.pre_pain_assessment, m.pre_behavior_assessment, m.effect_assessment, m.effect_assessed_at,
        m.adverse_reaction, m.variance_note, m.administered_by_name, m.professional_designation, m.authenticated_at
      FROM nova_medication_administrations m
      WHERE m.admission_id = $1 AND m.administered_at >= $2::date AND m.administered_at < $2::date + 1
      ORDER BY m.administered_at LIMIT 500`, [admissionId, date]);
    return { date, orders: orders.rows, administrations: given.rows };
  }

  // ---------------------------------------------------------------- note writing
  private noteFields(b: Record<string, unknown>) {
    const noteType = str(b, "note_type", { required: true, max: 40 })!;
    if (!NOTE_TYPES.has(noteType)) throw new ChartError("FIELD_INVALID:note_type");
    return {
      note_type: noteType,
      service_date: str(b, "service_date", { required: true, pattern: DATE }),
      start_time: str(b, "start_time", { pattern: TIME }),
      end_time: str(b, "end_time", { pattern: TIME }),
      location: str(b, "location", { max: 200 }),
      service_code: str(b, "service_code", { max: 20, pattern: /^[A-Za-z0-9]{3,10}$/ }),
      units: num(b, "units"),
      narrative: str(b, "narrative", { required: true, max: 20000 }),
      resident_response: str(b, "resident_response", { max: 8000 }),
      plan_next_steps: str(b, "plan_next_steps", { max: 8000 }),
      treatment_plan_goal_ids: uuidList(b, "treatment_plan_goal_ids"),
      requires_cosign: bool(b, "requires_cosign"),
      ai_drafted: bool(b, "ai_drafted"),
    };
  }

  private async createNote(db: PoolClient, c: ChartContext, admissionId: string, b: Record<string, unknown>) {
    const f = this.noteFields(b);
    const a = await db.query("SELECT patient_id FROM nova_admissions WHERE id = $1 AND status IN ('pending','active')", [admissionId]);
    if (a.rowCount !== 1) throw new ChartError("ADMISSION_NOT_FOUND", 404);
    const r = await db.query(`INSERT INTO nova_clinical_notes(tenant_id, patient_id, admission_id, note_type, service_date, start_time, end_time,
        location, service_code, units, narrative, resident_response, plan_next_steps, treatment_plan_goal_ids, requires_cosign, ai_drafted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id, authenticated_at, created_at`,
      [c.tenantId, a.rows[0].patient_id, admissionId, f.note_type, f.service_date, f.start_time, f.end_time, f.location, f.service_code,
       f.units, f.narrative, f.resident_response, f.plan_next_steps, f.treatment_plan_goal_ids, f.requires_cosign, f.ai_drafted]);
    return r.rows[0];
  }

  private async updateNote(db: PoolClient, noteId: string, b: Record<string, unknown>) {
    const f = this.noteFields(b);
    const own = await db.query("SELECT entered_by = nova_current_user() AS mine, authenticated_at FROM nova_clinical_notes WHERE id = $1", [noteId]);
    if (own.rowCount !== 1) throw new ChartError("NOTE_NOT_FOUND", 404);
    if (!own.rows[0].mine) throw new ChartError("ONLY_AUTHOR_CAN_EDIT_DRAFT", 403);
    const r = await db.query(`UPDATE nova_clinical_notes SET note_type=$2, service_date=$3, start_time=$4, end_time=$5, location=$6,
        service_code=$7, units=$8, narrative=$9, resident_response=$10, plan_next_steps=$11, treatment_plan_goal_ids=$12,
        requires_cosign=$13, ai_drafted=$14, updated_at=now()
      WHERE id = $1 RETURNING id, authenticated_at`,
      [noteId, f.note_type, f.service_date, f.start_time, f.end_time, f.location, f.service_code, f.units, f.narrative,
       f.resident_response, f.plan_next_steps, f.treatment_plan_goal_ids, f.requires_cosign, f.ai_drafted]);
    return r.rows[0];
  }

  private async signNote(db: PoolClient, noteId: string) {
    const own = await db.query("SELECT entered_by = nova_current_user() AS mine FROM nova_clinical_notes WHERE id = $1", [noteId]);
    if (own.rowCount !== 1) throw new ChartError("NOTE_NOT_FOUND", 404);
    if (!own.rows[0].mine) throw new ChartError("ONLY_AUTHOR_CAN_SIGN", 403);
    const r = await db.query("SELECT nova_sign('nova_clinical_notes', $1) AS signed_at", [noteId]);
    return { id: noteId, signed_at: r.rows[0].signed_at };
  }

  private async cosignNote(db: PoolClient, noteId: string) {
    const r = await db.query(`UPDATE nova_clinical_notes SET cosigned_by = nova_current_user()
      WHERE id = $1 AND requires_cosign AND cosigned_by IS NULL RETURNING id, cosigned_at`, [noteId]);
    if (r.rowCount !== 1) throw new ChartError("NOTE_NOT_AWAITING_COSIGN", 409);
    return r.rows[0];
  }

  private async addendum(db: PoolClient, noteId: string, b: Record<string, unknown>) {
    const type = str(b, "amendment_type", { required: true, max: 20 })!;
    if (!["correction","addendum","late_entry","entered_in_error"].includes(type)) throw new ChartError("FIELD_INVALID:amendment_type");
    const reason = str(b, "reason", { required: true, max: 1000 });
    const content = str(b, "amended_content", { required: true, max: 20000 });
    const n = await db.query("SELECT tenant_id, patient_id, authenticated_at FROM nova_clinical_notes WHERE id = $1", [noteId]);
    if (n.rowCount !== 1) throw new ChartError("NOTE_NOT_FOUND", 404);
    if (!n.rows[0].authenticated_at) throw new ChartError("NOTE_NOT_SIGNED_EDIT_DRAFT_INSTEAD", 409);
    const r = await db.query(`INSERT INTO nova_chart_amendments(tenant_id, patient_id, target_table, target_id, amendment_type, reason, amended_content, authenticated_by)
      VALUES ($1,$2,'nova_clinical_notes',$3,$4,$5,$6,nova_current_user()) RETURNING id, created_at, authenticated_at`,
      [n.rows[0].tenant_id, n.rows[0].patient_id, noteId, type, reason, content]);
    return r.rows[0];
  }

  // ---------------------------------------------------------------- MAR pass
  private async administer(db: PoolClient, b: Record<string, unknown>) {
    const orderId = id(str(b, "medication_order_id", { required: true }) ?? undefined);
    const outcome = str(b, "outcome", { required: true, max: 40 })!;
    if (!MAR_OUTCOMES.has(outcome)) throw new ChartError("FIELD_INVALID:outcome");
    const administeredAtRaw = str(b, "administered_at", { max: 40 });
    let administeredAt = new Date();
    if (administeredAtRaw) {
      administeredAt = new Date(administeredAtRaw);
      if (Number.isNaN(administeredAt.getTime())) throw new ChartError("FIELD_INVALID:administered_at");
      const ageMs = Date.now() - administeredAt.getTime();
      if (ageMs < -5 * 60_000) throw new ChartError("ADMINISTERED_AT_IN_FUTURE");
      if (ageMs > 24 * 3600_000) throw new ChartError("ADMINISTERED_AT_TOO_OLD_USE_LATE_ENTRY");
    }
    const scheduledFor = str(b, "scheduled_for", { max: 40 });
    const o = await db.query("SELECT tenant_id, patient_id, admission_id FROM nova_medication_orders WHERE id = $1", [orderId]);
    if (o.rowCount !== 1) throw new ChartError("MEDICATION_ORDER_NOT_FOUND", 404);
    // Drug, strength, dose, route, staff name and designation are set by the database
    // from the verified order and the staff roster; the client cannot supply them.
    const r = await db.query(`INSERT INTO nova_medication_administrations(tenant_id, patient_id, admission_id, medication_order_id, scheduled_for,
        administered_at, outcome, medication_name, strength, dose_given, route, reason_not_given, pre_pain_assessment, pre_behavior_assessment,
        variance_note, administered_by_name, professional_designation, authenticated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'-','-','-','-',$8,$9,$10,$11,'-','-',nova_current_user())
      RETURNING id, medication_name, strength, dose_given, route, professional_designation, administered_at, created_at, authenticated_at`,
      [o.rows[0].tenant_id, o.rows[0].patient_id, o.rows[0].admission_id, orderId, scheduledFor, administeredAt.toISOString(), outcome,
       str(b, "reason_not_given", { max: 1000 }), str(b, "pre_pain_assessment", { max: 2000 }), str(b, "pre_behavior_assessment", { max: 2000 }),
       str(b, "variance_note", { max: 1000 })]);
    return r.rows[0];
  }

  private async effect(db: PoolClient, adminId: string, b: Record<string, unknown>) {
    const eff = str(b, "effect_assessment", { max: 2000 });
    const adverse = str(b, "adverse_reaction", { max: 2000 });
    if (!eff && !adverse) throw new ChartError("FIELD_REQUIRED:effect_assessment");
    const cur = await db.query("SELECT effect_assessment, adverse_reaction FROM nova_medication_administrations WHERE id = $1", [adminId]);
    if (cur.rowCount !== 1) throw new ChartError("ADMINISTRATION_NOT_FOUND", 404);
    if ((eff && cur.rows[0].effect_assessment) || (adverse && cur.rows[0].adverse_reaction)) throw new ChartError("CHART_LOCKED_ALREADY_RECORDED", 409);
    const r = await db.query(`UPDATE nova_medication_administrations
        SET effect_assessment = COALESCE(effect_assessment, $2), adverse_reaction = COALESCE(adverse_reaction, $3)
      WHERE id = $1 RETURNING id, effect_assessment, effect_assessed_at, adverse_reaction`,
      [adminId, eff, adverse]);
    return r.rows[0];
  }
}
