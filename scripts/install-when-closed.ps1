# Stop-time install for the DeepSeek Harness Desktop profile.
#
# The Desktop shell owns its profile exclusively, so `dsh plugin` refuses to
# touch it; this script performs the same edit while the app is closed and then
# proves the result:
#
#   1. waits until every "DeepSeek Harness" process is gone
#   2. points the profile at this plugin (dependency + bundle entry)
#   3. runs the bundled pnpm
#   4. force-syncs the runtime files into node_modules and compares SHA-256 with
#      the source — pnpm alone is not enough: for file: dependencies it can
#      refresh only package.json and leave the old code hardlinked behind
#   5. restarts the app
#
# Layout: this script works both from the repository (scripts/) and from a flat
# deployed copy (script next to index.js).
#
# Usage:
#   pwsh -ExecutionPolicy Bypass -File scripts/install-when-closed.ps1 -WaitForExit
[CmdletBinding()]
param(
    [switch]$WaitForExit,
    [switch]$DryRun,
    [switch]$NoRelaunch,
    [string]$ProfileDir = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop'),
    [string]$DshRoot = 'E:\DeepSeek Harness',
    [string]$SourceDir,
    [switch]$SkipAppCheck
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Helpers = $PSScriptRoot
if (-not $SourceDir) {
    $parent = Split-Path -Parent $PSScriptRoot
    $SourceDir = if (Test-Path -LiteralPath (Join-Path $parent 'index.js')) { $parent } else { $PSScriptRoot }
}

$Node = Join-Path $DshRoot 'resources\runtime\bin\node.exe'
$PnpmEntry = Join-Path $DshRoot 'resources\runtime\pnpm\bin\pnpm.mjs'
$AppExe = Join-Path $DshRoot 'DeepSeek Harness.exe'
$EditManifest = Join-Path $Helpers 'edit-manifest.mjs'
$ReadVersion = Join-Path $Helpers 'read-version.mjs'
$LogPath = Join-Path $PSScriptRoot 'install-log.txt'
$Manifest = Join-Path $ProfileDir 'package.json'
$ManifestBak = Join-Path $ProfileDir 'package.json.bak-before-batch'
$WorkspaceYaml = Join-Path $ProfileDir 'pnpm-workspace.yaml'

$NewPackage = 'dsh-session-batch'
$NewSpec = '../../plugins/dsh-session-batch'
$RuntimeFiles = @('index.js', 'client.js', 'cordis.patch.yml', 'package.json')
# Files any previous version of this plugin may have registered under.
$StalePackages = @('dsh-plugin-conversation-purge', 'dsh-session-batch')

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

Write-Log "=== install $NewPackage into $ProfileDir ==="
Write-Log "source: $SourceDir"

foreach ($required in @($Node, $PnpmEntry, $EditManifest, $ReadVersion, $Manifest, (Join-Path $SourceDir 'index.js'))) {
    if (-not (Test-Path -LiteralPath $required)) {
        Write-Log "missing required path, aborting: $required"
        exit 1
    }
}

if ($WaitForExit) {
    if (Test-AppRunning) {
        Write-Log 'waiting for DeepSeek Harness to exit completely (close every window)…'
        $deadline = (Get-Date).AddMinutes(10)
        while (Test-AppRunning) {
            if ((Get-Date) -gt $deadline) {
                Write-Log 'timed out after 10 minutes; nothing was changed.'
                exit 2
            }
            Start-Sleep -Seconds 2
        }
        Start-Sleep -Seconds 2
        Write-Log 'app exited, installing.'
    } else {
        Write-Log 'app is not running, installing directly.'
    }
} elseif (-not $SkipAppCheck -and (Test-AppRunning)) {
    Write-Log 'DeepSeek Harness is running: a hot swap would leave client and host out of step, aborting.'
    Write-Log 'Re-run with -WaitForExit, or close the app first.'
    exit 3
}

if ($DryRun) {
    Write-Log 'DryRun: checks passed, nothing was changed.'
    exit 0
}

if (-not (Test-Path -LiteralPath $ManifestBak)) {
    Copy-Item -LiteralPath $Manifest -Destination $ManifestBak
    Write-Log 'backed up the current package.json'
}

function Restore-Manifest {
    if (Test-Path -LiteralPath $ManifestBak) {
        Copy-Item -LiteralPath $ManifestBak -Destination $Manifest -Force
        Write-Log 'restored the previous package.json'
    }
}

function Invoke-Manifest([string[]]$EditArgs) {
    $output = & $Node $EditManifest @EditArgs
    if ($LASTEXITCODE -ne 0) { throw "edit-manifest $($EditArgs -join ' ') failed: $output" }
    Write-Log ("  " + ($output -join ' '))
}

try {
    $spec = 'file:' + $NewSpec
    Invoke-Manifest @('set-dep', $Manifest, $NewPackage, $spec)
    Invoke-Manifest @('add-bundle', $Manifest, $NewPackage)

    foreach ($name in $StalePackages) {
        if ($name -eq $NewPackage) { continue }
        Invoke-Manifest @('remove-dep', $Manifest, $name)
        Invoke-Manifest @('remove-bundle', $Manifest, $name)
    }

    # Drop the old installed copies. Only ever inside the profile's node_modules.
    foreach ($name in $StalePackages) {
        $stale = Join-Path $ProfileDir "node_modules\$name"
        if (Test-Path -LiteralPath $stale) {
            Remove-Item -LiteralPath $stale -Recurse -Force
            Write-Log "  removed node_modules\$name"
        }
    }

    Push-Location $ProfileDir
    try {
        & $Node $PnpmEntry install --reporter=append-only 2>&1 | ForEach-Object { Write-Host $_ }
        $installExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    Write-Log "pnpm install exit code: $installExit (an ignored-build warning for other plugins is harmless)"

    Set-Content -LiteralPath $WorkspaceYaml -Value $WorkspaceYamlLines -Encoding utf8
    Write-Log 'pnpm-workspace.yaml restored'

    $target = Join-Path $ProfileDir "node_modules\$NewPackage"
    if (-not (Test-Path -LiteralPath $target)) { throw "node_modules\$NewPackage does not exist" }

    # Deliberately overwrite the runtime files: a file: dependency can keep stale
    # hardlinks, and a version check alone would not notice.
    foreach ($fileName in $RuntimeFiles) {
        $sourceFile = Join-Path $SourceDir $fileName
        $targetFile = Join-Path $target $fileName
        if (-not (Test-Path -LiteralPath $sourceFile)) { throw "missing source file: $sourceFile" }

        $synced = $false
        for ($attempt = 0; $attempt -lt 6 -and -not $synced; $attempt++) {
            try {
                if (Test-Path -LiteralPath $targetFile) { Remove-Item -LiteralPath $targetFile -Force -ErrorAction Stop }
                Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force -ErrorAction Stop
                $synced = $true
            } catch {
                Start-Sleep -Milliseconds (200 * ($attempt + 1))
            }
        }
        if (-not $synced) { throw "could not replace $fileName (still locked; make sure the app is fully closed)" }

        $sourceHash = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash
        $targetHash = (Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash
        if ($sourceHash -ne $targetHash) { throw "hash mismatch after sync: $fileName" }
        Write-Log "  synced $fileName ($($sourceHash.Substring(0, 12))…)"
    }

    $version = (& $Node $ReadVersion (Join-Path $target 'package.json')).Trim()
    $client = Get-Content -LiteralPath (Join-Path $target 'client.js') -Raw
    $hostText = Get-Content -LiteralPath (Join-Path $target 'index.js') -Raw
    if ($client -notmatch 'artifactToggle' -or $hostText -notmatch 'includeArtifacts' -or $hostText -notmatch 'artifactRetry') {
        throw 'installed files are missing expected markers'
    }
    Write-Log "verified: $NewPackage $version (artifact option + retry queue present)"

    $state = & $Node $EditManifest show $Manifest
    Write-Log "profile now: $state"
} catch {
    Write-Log "failed: $($_.Exception.Message)"
    Restore-Manifest
    Write-Log 'see the message above'
    exit 4
}

Write-Log 'install complete.'
if (-not $NoRelaunch) {
    Write-Log 'restarting DeepSeek Harness…'
    Start-Process -FilePath $AppExe
    Start-Sleep -Seconds 5
}
Write-Log '=== done ==='
