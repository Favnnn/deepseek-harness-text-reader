# install.ps1 - wire dsh-text-reader into the web profile.
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File install.ps1
# Idempotent: re-running refreshes the installed copy and the managed row.
# ASCII-only source: Windows PowerShell 5.1 reads BOM-less files as ANSI.
#
# The FIRST install copies the whole delivery folder (scripts included) into
# %DSH_HOME%\plugins\dsh-text-reader. From then on that installed copy is the
# live plugin and the delivery folder is just the portable master: the harness
# never reads this folder again, and uninstall.ps1 also ships in the installed
# copy.

$ErrorActionPreference = 'Stop'

# --- Locate the delivery folder ------------------------------------------------
$PluginDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($PluginDir)) {
  throw 'install.ps1 must run as a saved script file (needs $PSScriptRoot).'
}

# --- Pre-flight: a broken file must never reach the live copy -------------------
# A corrupted host.mjs would make the next server start fail loudly (the boot
# audit refuses to activate a broken entry), so gate the copy on a syntax check
# when node is available. The installed copy stays untouched on failure.
$Node = Get-Command node -ErrorAction SilentlyContinue
if ($Node) {
  foreach ($CheckFile in @('boot.mjs', 'host.mjs', 'client.js')) {
    $CheckPath = Join-Path $PluginDir $CheckFile
    if (Test-Path $CheckPath) {
      & node --check $CheckPath
      if ($LASTEXITCODE -ne 0) {
        throw "$CheckFile failed the syntax pre-check; the installed copy was NOT touched. Fix or re-copy the folder, then run install.bat again."
      }
    }
  }
}

# --- Resolve the harness home ---------------------------------------------------
$DshHome = $env:DSH_HOME
if ([string]::IsNullOrEmpty($DshHome)) { $DshHome = Join-Path $env:USERPROFILE '.dsh' }

# --- Copy the whole folder into the harness home ---------------------------------
$InstallDir = Join-Path $DshHome 'plugins/dsh-text-reader'
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
foreach ($File in @('package.json', 'boot.mjs', 'host.mjs', 'client.js', 'install.ps1', 'uninstall.ps1', 'install.bat', 'uninstall.bat', 'README.md', 'cordis.patch.yml')) {
  $From = (Resolve-Path (Join-Path $PluginDir $File)).Path
  $To = Join-Path $InstallDir $File
  if ($From -ne $To) { Copy-Item -Force $From $To }
}
# The row mounts boot.mjs - a guarded launcher that always imports cleanly.
# A corrupted host.mjs then only disables the reader; the server still starts.
$HostFile = Join-Path $InstallDir 'boot.mjs'
$HostUrl = [System.Uri]::new($HostFile).AbsoluteUri

# --- Rewrite the delivery folder's informational patch file ---------------------
$PatchSource = Join-Path $PluginDir 'cordis.patch.yml'
$PatchContent = @(
  '# Text reader - informational copy of the row installed by install.ps1.',
  '# The live row lives in %DSH_HOME%\profiles\web\cordis.patch.yml and points at',
  '# the guarded launcher (boot.mjs) of the installed copy under',
  '# %DSH_HOME%\plugins\dsh-text-reader; boot.mjs loads host.mjs defensively.',
  '- insert:',
  ('  - name: ' + $HostUrl),
  '    config:',
  '      enabled: true'
) -join "`r`n"
[System.IO.File]::WriteAllText($PatchSource, $PatchContent + "`r`n", (New-Object System.Text.UTF8Encoding($false)))

# --- Append the managed insert row to the profile's user patch layer ----------
$ProfileDir = Join-Path $DshHome 'profiles/web'
if (-not (Test-Path $ProfileDir)) { throw "dsh web profile not found at $ProfileDir" }
$ProfilePatch = Join-Path $ProfileDir 'cordis.patch.yml'

$RowMarker = '# dsh-text-reader (managed by install.ps1)'
$RowBody = @('- insert:', ('  - name: ' + $HostUrl), '    config:', '      enabled: true')

$Utf8 = New-Object System.Text.UTF8Encoding($false)
if (Test-Path $ProfilePatch) {
  $ExistingText = [System.IO.File]::ReadAllText($ProfilePatch)
  $Existing = $ExistingText -split "`r?`n"
  $Kept = @()
  $SkipRow = $false
  foreach ($Line in $Existing) {
    if ($Line -eq $RowMarker) { $SkipRow = $true; continue }
    if ($SkipRow) {
      # Drop the previously written 4-line managed row.
      if ($Line -match '^(\s|-)') { continue }
      $SkipRow = $false
    }
    $Kept += $Line
  }
  # Trim trailing blanks; Select-Object -First is safe even when one
  # element is left (a 0..count-2 slice would loop forever on it).
  while ($Kept.Count -gt 0 -and $Kept[$Kept.Count - 1] -eq '') {
    $Kept = @($Kept | Select-Object -First ($Kept.Count - 1))
  }
  $Merged = ($Kept -join "`r`n") + "`r`n`r`n" + $RowMarker + "`r`n" + ($RowBody -join "`r`n") + "`r`n"
  [System.IO.File]::WriteAllText($ProfilePatch, $Merged, $Utf8)
} else {
  $Fresh = $RowMarker + "`r`n" + ($RowBody -join "`r`n") + "`r`n"
  [System.IO.File]::WriteAllText($ProfilePatch, $Fresh, $Utf8)
}

Write-Host ''
Write-Host 'dsh-text-reader installed.' -ForegroundColor Green
Write-Host "  delivery folder : $PluginDir (portable master, kept as-is)"
Write-Host "  installed copy  : $InstallDir (the live plugin)"
Write-Host "  profile patch   : $ProfilePatch"
Write-Host ''
Write-Host 'The web profile hot-applies the patch; if the icon does not appear,'
Write-Host 'reload the page (F5) or restart pnpm dsh web once.'
Write-Host 'To uninstall later, run uninstall.ps1 from the installed copy.'
