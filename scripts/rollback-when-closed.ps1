# Stop-time rollback for the DeepSeek Harness Desktop profile.
#
# Restores the package.json that install-when-closed.ps1 backed up before it
# changed anything, then re-installs from it.
#
# Usage:
#   pwsh -ExecutionPolicy Bypass -File scripts/rollback-when-closed.ps1 -WaitForExit
[CmdletBinding()]
param(
    [switch]$WaitForExit,
    [switch]$DryRun,
    [switch]$NoRelaunch,
    [string]$ProfileDir = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop'),
    [string]$DshRoot = 'E:\DeepSeek Harness',
    [switch]$SkipAppCheck
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Helpers = $PSScriptRoot
$Node = Join-Path $DshRoot 'resources\runtime\bin\node.exe'
$PnpmEntry = Join-Path $DshRoot 'resources\runtime\pnpm\bin\pnpm.mjs'
$AppExe = Join-Path $DshRoot 'DeepSeek Harness.exe'
$EditManifest = Join-Path $Helpers 'edit-manifest.mjs'
$LogPath = Join-Path $PSScriptRoot 'rollback-log.txt'
$Manifest = Join-Path $ProfileDir 'package.json'
$ManifestBak = Join-Path $ProfileDir 'package.json.bak-before-batch'
$WorkspaceYaml = Join-Path $ProfileDir 'pnpm-workspace.yaml'

function Write-Log([string]$Message) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $LogPath -Value $line -Encoding utf8
}

function Test-AppRunning {
    return [bool](Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)
}

$WorkspaceYamlLines = @(
    'packages:',
    '  - .',
    '',
    'nodeLinker: hoisted',
    'autoInstallPeers: false',
    '',
    'allowBuilds:',
    '  dsh-purge: true'
)

Write-Log '=== rollback to the pre-install manifest ==='

if (-not (Test-Path -LiteralPath $ManifestBak)) {
    Write-Log "no backup found at $ManifestBak; nothing to roll back"
    exit 1
}

if ($WaitForExit -and (Test-AppRunning)) {
    Write-Log 'waiting for DeepSeek Harness to exit…'
    while (Test-AppRunning) { Start-Sleep -Seconds 2 }
    Start-Sleep -Seconds 2
}

if ((-not $SkipAppCheck) -and (Test-AppRunning) -and -not $DryRun) {
    Write-Log 'app is still running: a hot swap would leave client and host out of step, aborting.'
    exit 3
}

if ($DryRun) {
    Write-Log 'DryRun: checks passed, nothing was changed.'
    exit 0
}

Copy-Item -LiteralPath $ManifestBak -Destination $Manifest -Force
Write-Log 'package.json restored from backup'

Push-Location $ProfileDir
try {
    & $Node $PnpmEntry install --reporter=append-only 2>&1 | ForEach-Object { Write-Host $_ }
    $installExit = $LASTEXITCODE
} finally {
    Pop-Location
}
Write-Log "pnpm install exit code: $installExit"

Set-Content -LiteralPath $WorkspaceYaml -Value $WorkspaceYamlLines -Encoding utf8
Write-Log 'pnpm-workspace.yaml restored'

$state = & $Node $EditManifest show $Manifest
Write-Log "profile now: $state"

if (-not $NoRelaunch) {
    Write-Log 'restarting DeepSeek Harness…'
    Start-Process -FilePath $AppExe
}
Write-Log '=== done ==='
