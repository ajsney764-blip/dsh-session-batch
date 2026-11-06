# Copy the runtime files from this repository into the deployed plugin directory
# the DSH profile points at, then prove the copies match.
#
# The profile references `file:../../plugins/dsh-session-batch`, so that directory
# is what the app loads. Fixing a bug here alone would not reach it; run this
# script, then install with install-when-closed.ps1 while the app is closed.
#
# Usage:
#   pwsh -ExecutionPolicy Bypass -File scripts/sync-deployment.ps1
[CmdletBinding()]
param(
    [string]$SourceDir,
    [string]$TargetDir
)

$ErrorActionPreference = 'Stop'

# Resolved in the body: under Windows PowerShell 5.1, $PSScriptRoot is not yet
# populated while parameter defaults are evaluated.
if (-not $SourceDir) { $SourceDir = Split-Path $PSScriptRoot -Parent }
if (-not $TargetDir) { $TargetDir = Join-Path $env:USERPROFILE '.dsh\plugins\dsh-session-batch' }

# Runtime files the profile loads, plus the scripts that keep working from the
# deployed copy (the workspace shortcut points at install-when-closed.ps1 there).
$Files = @(
    'index.js',
    'client.js',
    'cordis.patch.yml',
    'package.json',
    'README.md',
    'install-when-closed.ps1',
    'rollback-when-closed.ps1',
    'edit-manifest.mjs',
    'read-version.mjs',
    'run-tests.mjs'
)

Write-Host "source: $SourceDir"
Write-Host "target: $TargetDir"

if (-not (Test-Path -LiteralPath (Join-Path $SourceDir 'index.js'))) {
    throw "source does not look like the plugin: $SourceDir"
}
if (-not (Test-Path -LiteralPath $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$failed = 0
foreach ($name in $Files) {
    $source = if ($name -in @('index.js', 'client.js', 'cordis.patch.yml', 'package.json', 'README.md')) {
        Join-Path $SourceDir $name
    } else {
        Join-Path (Join-Path $SourceDir 'scripts') $name
    }
    $target = Join-Path $TargetDir $name

    if (-not (Test-Path -LiteralPath $source)) {
        Write-Host "  missing in source, skipped: $name"
        continue
    }
    if (-not (Test-Path -LiteralPath $target)) {
        Copy-Item -LiteralPath $source -Destination $target -Force
    } else {
        # Unlink first: a deployed file may be hardlinked to an older source inode.
        Copy-Item -LiteralPath $source -Destination $target -Force
    }
    $same = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($same) {
        Write-Host "  synced $name"
    } else {
        Write-Host "  HASH MISMATCH $name"
        $failed += 1
    }
}

if ($failed -gt 0) {
    Write-Host "$failed file(s) did not match after copying." -ForegroundColor Red
    exit 1
}

$version = (Get-Content -LiteralPath (Join-Path $TargetDir 'package.json') -Raw | ConvertFrom-Json).version
Write-Host "deployment synced at $version"
Write-Host 'Next: fully quit DeepSeek Harness, then run install-when-closed.ps1 -WaitForExit'
