# Build 68 — NovaClerk Documentation Agent (Phase 1)

> There is a human behind the machine. NovaClerk drafts; staff decide and sign.

The first NovaClerk slice turns a staff member's own rough notes into a draft progress note, inside the NovaCärïs chart's note editor ("Draft with NovaClerk").

## What it does
- **Drafts** the narrative, resident response and plan from the staff member's words, and links treatment-plan goals.
- **Fabrication guard** (`src/guard.ts`) checks every draft sentence against the source notes. It runs on every draft, from any model.
  - **Blocks:** invented numbers or times, invented medications, changed or invented quotes, invented risk events (self-harm, restraint, intoxication…), dropped or added negatives, and uncertainty stated as fact.
  - **Flags for review:** sentences the notes don't clearly support.
- **Provenance:** every sentence is labeled *From your notes* (SOURCE_FACT), *Reworded* (TRANSFORMED) or *Suggested — check it* (SUGGESTED). Staff see this under **Why am I seeing this?**
- **Coach** names what's missing: intervention, resident response, plan, goal link, and times for billable services.

## Human-in-the-loop rules (enforced by the database)
- An AI draft is always unsigned and marked AI-drafted, permanently.
- A flagged draft can't be signed until its **author** marks the flags as reviewed. Nobody else can do that for them.
- A note marked AI-drafted with no stored NovaClerk run can't be signed.
- Every run is stored append-only with the source text and its hash, the model, the flags and the provenance. Runs are tenant-isolated by RLS.

## Model providers
- **Default — `reference-extractive`:** deterministic. It only rearranges the staff member's own sentences, so it can't invent anything. Safe to use today.
- **`anthropic` (LLM):** off unless all of these are set:
  - `NOVA_AI_PROVIDER=anthropic`
  - `NOVA_AI_API_KEY`
  - `NOVA_AI_MODEL`
  - `NOVA_AI_BAA_CONFIRMED=true`, set only after a HIPAA Business Associate Agreement covering this use is signed.

  The provider refuses to start without the BAA flag, uses HTTPS only, and accepts only the three text fields back from the model.

## Test harness
Run it with `npm run harness:novaclerk`. It is also part of `npm run check:pilot`.

| Category | Cases | What it checks |
|---|---|---|
| A Straightforward | 10 | Complete notes produce complete drafts |
| B Incomplete | 10 | Missing parts are flagged; nothing is invented |
| C Ambiguous | 10 | Uncertainty, negatives and quotes survive |
| D Fabrication challenges | 10 | Guard catches invented facts |
| E Negation and quote | 10 | Guard catches meaning flips |

Cases span 10 staff roles. A further 4 tests check provider safety, and one runs a deliberately bad model, which must produce **STOP**.

Gate (PILOT-10I):
- **STOP:** any fabrication or negation/uncertainty failure, whatever the total.
- **GO:** at least 95%.
- **FIX:** at least 85%.
- **HOLD:** below 85%.

**Current result: 50/50, GO, for the reference provider.** When an LLM is enabled, pass it to `runHarness(provider)` and re-run the full suite. Expect failures on the first real run; that is what the harness is for.

## Not in this slice
Translation, medication-safety, controlled-substance (PDMP), status-change and EHR-sync agents. Voice capture is not wired in yet (build 04 tables exist).
