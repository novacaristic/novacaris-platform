-- =====================================================================
-- BUILD 68 — NovaClerk Documentation Agent (Phase 1): AI drafts, never signatures
-- "There is a human behind the machine."
--  * Every AI draft records which model produced it and the guard's findings.
--  * An AI-drafted note cannot be signed until its author has reviewed the
--    guard's flags and acknowledged them (database rule, not just the screen).
--  * Provenance is append-only and tenant-isolated.
-- =====================================================================
SET client_min_messages = warning;

ALTER TABLE nova_clinical_notes ADD COLUMN IF NOT EXISTS ai_guard_status text
  CHECK (ai_guard_status IS NULL OR ai_guard_status IN ('clean','review_required','blocked'));
ALTER TABLE nova_clinical_notes ADD COLUMN IF NOT EXISTS ai_flags_acknowledged_by uuid REFERENCES nova_users(id);
ALTER TABLE nova_clinical_notes ADD COLUMN IF NOT EXISTS ai_flags_acknowledged_at timestamptz;

CREATE TABLE IF NOT EXISTS nova_ai_draft_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES nova_tenants(id),
 patient_id uuid NOT NULL REFERENCES nova_patients(id),
 admission_id uuid NOT NULL REFERENCES nova_admissions(id),
 note_id uuid NOT NULL REFERENCES nova_clinical_notes(id),
 requested_by uuid REFERENCES nova_users(id),
 provider text NOT NULL,
 model text,
 source_text text NOT NULL,                 -- the staff member's own words
 source_sha256 text NOT NULL,
 draft jsonb NOT NULL,                      -- what the agent proposed
 guard_status text NOT NULL CHECK (guard_status IN ('clean','review_required','blocked')),
 guard_flags jsonb NOT NULL DEFAULT '[]',   -- "Why am I seeing this?"
 provenance jsonb NOT NULL DEFAULT '[]',    -- SOURCE_FACT / TRANSFORMED / SUGGESTED per sentence
 coach jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_draft_runs_note ON nova_ai_draft_runs(tenant_id, note_id, created_at);

-- Append-only, server-stamped, tied to the requesting user and to a draft (unsigned) AI note
CREATE OR REPLACE FUNCTION nova_ai_draft_run_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n nova_clinical_notes;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'AI_RUN_APPEND_ONLY: AI draft records cannot be changed or deleted'; END IF;
  SELECT * INTO n FROM nova_clinical_notes WHERE id = NEW.note_id;
  IF n.id IS NULL OR n.patient_id <> NEW.patient_id OR n.admission_id <> NEW.admission_id THEN
    RAISE EXCEPTION 'WRONG_RESIDENT: AI draft does not match the note';
  END IF;
  IF NOT n.ai_drafted OR n.authenticated_at IS NOT NULL THEN
    RAISE EXCEPTION 'AI_RUN_TARGET: AI drafts attach only to unsigned AI-drafted notes';
  END IF;
  NEW.requested_by := nova_current_user();
  IF NEW.requested_by IS NULL OR NEW.requested_by IS DISTINCT FROM n.entered_by THEN
    RAISE EXCEPTION 'NOT_AUTHOR: only the note author can attach an AI draft';
  END IF;
  NEW.created_at := now();
  NEW.source_sha256 := encode(sha256(convert_to(NEW.source_text, 'UTF8')), 'hex');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_ai_draft_run_rules ON nova_ai_draft_runs;
CREATE TRIGGER a_ai_draft_run_rules BEFORE INSERT OR UPDATE OR DELETE ON nova_ai_draft_runs FOR EACH ROW EXECUTE FUNCTION nova_ai_draft_run_rules();
DROP TRIGGER IF EXISTS zz_chart_audit ON nova_ai_draft_runs;
CREATE TRIGGER zz_chart_audit AFTER INSERT ON nova_ai_draft_runs FOR EACH ROW EXECUTE FUNCTION nova_chart_audit_fn();

-- Human-in-the-loop rules on the note itself
CREATE OR REPLACE FUNCTION nova_ai_note_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE me uuid := nova_current_user(); latest text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.ai_guard_status := NULL; NEW.ai_flags_acknowledged_by := NULL; NEW.ai_flags_acknowledged_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.ai_drafted AND NOT NEW.ai_drafted THEN RAISE EXCEPTION 'AI_FLAG_LOCKED: an AI-drafted note stays marked as AI-drafted'; END IF;
  -- guard status mirrors the latest stored AI run; clients cannot set it
  SELECT guard_status INTO latest FROM nova_ai_draft_runs WHERE note_id = NEW.id ORDER BY created_at DESC LIMIT 1;
  NEW.ai_guard_status := latest;
  -- acknowledgement: only the author, only by setting it, stamped by the database
  IF OLD.ai_flags_acknowledged_by IS NULL AND NEW.ai_flags_acknowledged_by IS NOT NULL THEN
    IF NEW.ai_flags_acknowledged_by IS DISTINCT FROM me OR me IS DISTINCT FROM OLD.entered_by THEN
      RAISE EXCEPTION 'AI_ACK_NOT_AUTHOR: only the author can acknowledge the AI review flags';
    END IF;
    NEW.ai_flags_acknowledged_at := now();
  ELSIF NEW.ai_flags_acknowledged_by IS DISTINCT FROM OLD.ai_flags_acknowledged_by
     OR NEW.ai_flags_acknowledged_at IS DISTINCT FROM OLD.ai_flags_acknowledged_at THEN
    RAISE EXCEPTION 'AI_ACK_FORGED: acknowledgement is set only by acknowledging';
  END IF;
  -- a new AI run after acknowledgement needs a fresh review
  IF EXISTS (SELECT 1 FROM nova_ai_draft_runs r WHERE r.note_id = NEW.id AND r.created_at > COALESCE(NEW.ai_flags_acknowledged_at, '-infinity'))
     AND NEW.ai_flags_acknowledged_at IS NOT NULL AND OLD.ai_flags_acknowledged_at IS NOT NULL THEN
    NEW.ai_flags_acknowledged_by := NULL; NEW.ai_flags_acknowledged_at := NULL;
  END IF;
  -- signing an AI draft requires a human review of any flags
  IF OLD.authenticated_at IS NULL AND NEW.authenticated_by IS NOT NULL AND NEW.ai_drafted THEN
    IF NOT EXISTS (SELECT 1 FROM nova_ai_draft_runs WHERE note_id = NEW.id) THEN
      RAISE EXCEPTION 'AI_REVIEW_REQUIRED: AI-drafted note has no stored AI run to review';
    END IF;
    IF latest IN ('review_required','blocked') AND NEW.ai_flags_acknowledged_at IS NULL THEN
      RAISE EXCEPTION 'AI_REVIEW_REQUIRED: review and acknowledge the AI flags before signing';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS b_ai_note_rules ON nova_clinical_notes;
CREATE TRIGGER b_ai_note_rules BEFORE INSERT OR UPDATE ON nova_clinical_notes FOR EACH ROW EXECUTE FUNCTION nova_ai_note_rules();

-- guard columns may change on a signed note only through the rules above
DO $attach$ BEGIN
  PERFORM nova_chart_attach('nova_clinical_notes', ARRAY['cosigned_by','cosigned_at','~ai_guard_status']);
END $attach$;

-- cover the new table with row-level security
SELECT nova_apply_rls();
