# Build 12 — NOVA Intelligence Engine

The governed reasoning layer connecting Build 07 intelligence to the Build 03 Mr. NOVA runtime and Build 11 live command runtime.

## Intelligence pipeline

CONTEXT → RETRIEVE → EVIDENCE → REASON → RISK → RECOMMEND → AUTHORIZE → ACT → VERIFY.

## Inputs
- tenant-scoped memory
- approved knowledge
- evidence
- compliance findings
- corrective actions
- clinical workflow state
- EHR state
- agent/task state
- command context

## Outputs
- explanations
- summaries
- predictions
- recommendations
- draft actions
- confidence
- evidence references
- risk classification
- required authorization

## Hard boundary

NOVA intelligence is advisory unless an existing governed action path explicitly authorizes execution.

No recommendation is treated as proof. No prediction is treated as fact.
