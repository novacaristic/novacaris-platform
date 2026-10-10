# Build 63.1 — Windows Quick Agent Launcher

## Purpose
Generate a fresh agent folder from Build 63 using PowerShell, with a unique folder/name, a stated purpose and owner, and safe defaults. The script prepares a folder; it does not register or deploy an agent.

## Requirements
- Windows PowerShell 5.1 or PowerShell 7
- The Build 63 template folder present locally
- An existing output folder

## Example
From the repository root in PowerShell:

```powershell
$root = (Resolve-Path .).Path
$out = Join-Path $root 'local-agents'
New-Item -ItemType Directory -Force $out | Out-Null

& "$root/builds/63-quick-agent-template/scripts/New-NovaQuickAgent.ps1" `
  -Name 'intake-form-checker' `
  -Purpose 'Check a supplied synthetic intake form for missing fields and return a checklist.' `
  -Owner 'Operations Team' `
  -OutputRoot $out
```

Then inspect:
- `local-agents/intake-form-checker/agent.manifest.json`
- `local-agents/intake-form-checker/prompt.template.md`
- `local-agents/intake-form-checker/README.md`

## Safe defaults
- Starts in `draft` status and `dry_run` mode.
- Starts as a Tier 1 candidate, not automatically approved for Tier 1 execution.
- Starts with no allowed tools.
- Keeps Tier 2 human approval and required audit settings enabled.
- Refuses to overwrite an existing destination.
- Removes a partially generated folder if preparation fails.

## Important limitations
The launcher does not validate against the full JSON Schema using a dedicated schema engine; it parses JSON and checks required fields and critical safe defaults. It does not provision a model, configure secrets, issue identities, register permissions, create a runtime, or deploy to production. Those steps require the NovaCarïs host platform and its enforced Trust Gate. Never use real patient data in local demonstrations.
