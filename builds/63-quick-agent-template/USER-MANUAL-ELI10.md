# NovaCarïs Quick Agent — User Manual (Explain Like I'm 10)

## What is an agent?
An agent is a helper with one job. One helper checks forms. Another summarizes a document. Another drafts a reply. One clear job makes a helper easier to test and keep safe.

## What does this template give you?
- Manifest: the helper's ID card and rule sheet.
- Prompt: the instructions for its job.
- Schema: a rule checker for the manifest's shape.
- Launcher: a PowerShell script that creates a fresh agent folder.
- This manual: setup instructions.

The template does not magically install a model, connect tools, or secure a server. Your NovaCarïs runtime must already provide those parts.

## Create a quick agent on Windows
1. Download or clone the NovaCarïs repository to your computer.
2. Open PowerShell in the repository folder.
3. Create a folder to hold your new agents:

   ```powershell
   New-Item -ItemType Directory -Force .\\local-agents | Out-Null
   ```

4. Run the launcher, replacing the example job details with your own:

   ```powershell
   .\\builds\\63-quick-agent-template\\scripts\\New-NovaQuickAgent.ps1 `
     -Name 'intake-form-checker' `
     -Purpose 'Check a made-up intake form for missing fields.' `
     -Owner 'Operations Team' `
     -OutputRoot .\\local-agents
   ```

5. Open the new folder under local-agents and review agent.manifest.json and prompt.template.md.
6. Leave execution_mode set to dry_run. This means “practice only; do not change real systems.”
7. Test with public or made-up data only.
8. Ask an administrator to review and register the agent in the NovaCarïs host platform.
9. Do not enable real tools or production execution until the security checks pass.

## What are the safety levels?
- Tier 1: a small, approved task that is low-risk and has a tested recovery plan.
- Tier 2: an important action. A real, authorized human must approve the exact action.
- Deny/quarantine: the helper must stop because the action is forbidden, unclear, or untrusted.

The helper cannot choose its own tier. Mr. NOVA helps oversee the process, but the platform Trust Gate must enforce the rules.

## What does “deploy in minutes” mean?
If the platform, model, permissions, and tools are already set up, a simple helper may be configured and tested in minutes. Connecting a new system, building a tool, security testing, or approving production can take longer.

## Golden rules
- Never put passwords, API keys, or secret tokens in these files.
- Never test with real patient information.
- Never give a helper more access than it needs.
- A prompt is not a security lock. The server must enforce permissions.
- Every action needs a traceable identity and audit event.
- If identity or required audit storage cannot be checked, the system must stop safely.
- Never enable a real-world action just because a demo looked good.

## If something goes wrong
1. Stop the test; do not keep retrying blindly.
2. Save the action ID and error message. Do not copy secrets or patient data into a ticket.
3. Ask an administrator to check agent status, permissions, policy version, and audit history.
4. Suspend the agent if it may be acting outside its job.
5. Resume only after the cause is fixed and the tests pass again.

## Simple example
Job: Read a made-up form and list missing fields.

Allowed: Read supplied text and return a checklist.

Not allowed: Submit the form, sign it, email it, or change a real record.

That is a good first quick agent because it produces useful work without changing another system.
