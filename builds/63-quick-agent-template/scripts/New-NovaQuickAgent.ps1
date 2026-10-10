[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9][a-z0-9-]{1,62}$')][string]$Name,
  [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$Purpose,
  [Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()][string]$Owner,
  [Parameter(Mandatory=$true)][ValidateScript({ Test-Path $_ -PathType Container })][string]$OutputRoot,
  [string]$TemplateRoot = (Join-Path $PSScriptRoot '..'),
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$template = (Resolve-Path $TemplateRoot).Path
$destination = Join-Path (Resolve-Path $OutputRoot).Path $Name

if (-not (Test-Path (Join-Path $template 'agent.manifest.json'))) {
  throw "Template manifest not found under: $template"
}
if (Test-Path $destination) {
  if (-not $Force) { throw "Destination already exists: $destination. Choose another name or use -Force to replace it." }
  throw "-Force is intentionally not implemented; refusing to overwrite an existing agent folder."
}

New-Item -ItemType Directory -Path $destination | Out-Null
try {
  Copy-Item (Join-Path $template 'agent.manifest.json') $destination
  Copy-Item (Join-Path $template 'agent.manifest.schema.json') $destination
  Copy-Item (Join-Path $template 'prompt.template.md') $destination
  Copy-Item (Join-Path $template 'USER-MANUAL-ELI10.md') $destination
  if (Test-Path (Join-Path $template 'examples')) {
    Copy-Item (Join-Path $template 'examples') $destination -Recurse
  }

  $manifestPath = Join-Path $destination 'agent.manifest.json'
  $manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
  $manifest.name = $Name
  $manifest.purpose = $Purpose
  $manifest.owner = $Owner
  $manifest.status = 'draft'
  $manifest.risk_tier = 'tier_1_candidate'
  $manifest.execution_mode = 'dry_run'
  $manifest.agent_id = 'assign-at-registration'
  $manifest.allowed_tools = @()
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 $manifestPath

  $required = @('schema_version','agent_id','name','version','owner','purpose','status','risk_tier','execution_mode','data_classification','input_contract','output_contract','allowed_tools','allowed_actions','denied_actions','human_approval','limits','audit','rollback','review')
  $parsed = Get-Content -Raw $manifestPath | ConvertFrom-Json
  foreach ($field in $required) {
    if ($null -eq $parsed.PSObject.Properties[$field]) { throw "Manifest is missing required field: $field" }
  }
  if ($parsed.execution_mode -ne 'dry_run') { throw 'New agents must start in dry_run mode.' }
  if ($parsed.human_approval.required_for_tier_2 -ne $true) { throw 'Tier 2 human approval must remain enabled.' }
  if ($parsed.audit.required -ne $true) { throw 'Audit requirement must remain enabled.' }
  if ($parsed.allowed_tools.Count -ne 0) { throw 'Quick-created agents must start with no allowed tools.' }

  @"
# Agent: $Name

Purpose: $Purpose

Owner: $Owner

## First steps
1. Review agent.manifest.json and prompt.template.md.
2. Keep execution_mode as dry_run.
3. Test only with public or synthetic input.
4. Have an administrator validate the manifest and register a unique agent identity in the NovaCarïs host runtime.
5. Do not enable external tools or production execution until the Trust Gate and required tests pass.

This folder was created by the Build 63.1 launcher. It is prepared for review; it has NOT been registered or deployed to a runtime.
"@ | Set-Content -Encoding utf8 (Join-Path $destination 'README.md')

  Write-Host ''
  Write-Host "PREPARED: $destination" -ForegroundColor Green
  Write-Host 'Mode: dry_run | Tools: none | External side effects: none'
  Write-Host 'Next: review the manifest, test with synthetic data, then register through the approved host runtime.'
  Write-Host 'This script does not install a model, issue credentials, register the agent, or deploy it.'
}
catch {
  if (Test-Path $destination) { Remove-Item -Recurse -Force $destination }
  throw
}
