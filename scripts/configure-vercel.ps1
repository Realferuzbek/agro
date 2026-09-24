param([string]$SiteUrl = 'https://barakaagro.app')
$ErrorActionPreference = 'Stop'
$project = Get-Content -LiteralPath '.vercel/project.json' -Raw | ConvertFrom-Json
if ($project.projectId -ne 'prj_QKybirBzwAMFvzFGtLfKXOcn5Ejw' -or $project.orgId -ne 'team_gaFHl3p6xy0p3WEHdWNyVu3A') { throw 'Unexpected Vercel linkage. This script is restricted to the approved agro project.' }
if ($SiteUrl -ne 'https://barakaagro.app') { throw 'Unexpected application origin.' }
$cloudValues = @{}
foreach ($line in Get-Content -LiteralPath '.env.hosted.local') {
  if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { $cloudValues[$matches[1]] = $matches[2].Trim('"').Trim("'") }
}
if ($cloudValues['NEXT_PUBLIC_SUPABASE_URL'] -ne 'https://gunzhtlbpxwpprqwnhfd.supabase.co') { throw 'Unexpected Supabase target.' }
$cloudValues['NEXT_PUBLIC_SITE_URL'] = $SiteUrl
foreach ($name in @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SITE_URL')) {
  if ([string]::IsNullOrWhiteSpace($cloudValues[$name])) { throw "Missing $name in the private hosted environment." }
  foreach ($environment in @('production','preview')) {
    $arguments = @('env','add',$name,$environment,'--force','--scope','feruzbeks-projects-10a1b6ab')
    if ($name -eq 'SUPABASE_SERVICE_ROLE_KEY') { $arguments += '--sensitive' }
    # Secret values are sent through stdin, never interpolated into command arguments.
    $cloudValues[$name] | & vercel @arguments
    if ($LASTEXITCODE -ne 0) { throw "Vercel configuration failed for $name ($environment)." }
  }
}
$hostedPath = (Resolve-Path -LiteralPath '.env.hosted.local').Path
$saved = [System.IO.File]::ReadAllText($hostedPath)
$saved = [regex]::Replace($saved,'(?m)^NEXT_PUBLIC_SITE_URL=.*\r?\n?','')
[System.IO.File]::WriteAllText($hostedPath,$saved.TrimEnd()+"`nNEXT_PUBLIC_SITE_URL=$SiteUrl`n")
Write-Output 'Approved Vercel production/preview environments configured. No secret values printed.'
