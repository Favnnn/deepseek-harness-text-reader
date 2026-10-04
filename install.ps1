# install.ps1 - install dsh-text-reader into the web profile (dsh v0.2.0-rc.2).
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File install.ps1
#
# The ONLY supported install is the harness's own: this script packs this
# folder into a tarball (pnpm pack) and runs
#   pnpm dsh plugin --profile web add <that tarball>
# from the harness checkout. That registers the package as a profile bundle:
# the harness adds it to the profile manifest, installs a REAL COPY of the
# package into the profile's node_modules, and loads cordis.patch.yml from the
# bundle as an overlay row. The Plugins page then lists the plugin with the
# enable switch and the settings editor (the plugins.bundle.config slot).
# Because the profile holds its own copy, this folder can be moved or deleted
# at any time without breaking the running plugin.
#
# This script performs, in order:
#   0. syntax pre-check of the runtime files (node --check; a broken file
#      must never reach the profile copy);
#   1. vendor the config-schema library into .\deps (ships with the bundle);
#   2. remove the legacy file:// row older installers wrote into the profile
#      patch (a leftover would double-register the package and break the
#      rc.2 client-module scan);
#   3. remove the legacy installed copy under %DSH_HOME%\plugins (old flow);
#   4. pack the folder, run the official `dsh plugin add <tarball>`, then
#      delete the packed artifact (pointwise: the exact name-version path,
#      plus the exact tarball the profile previously referenced).
#
# Idempotent: re-running refreshes everything. After editing the plugin
# source, re-run this script so the profile copies the new bytes.
# ASCII-only source: Windows PowerShell 5.1 reads BOM-less files as ANSI.

param(
  # Harness source checkout (provides vendor\schemastery and the dsh CLI).
  # Probed automatically when omitted.
  [string]$HarnessRoot = '',
  # Profile to install into. The web app is this plugin's target.
  [string]$Profile = 'web'
)

$ErrorActionPreference = 'Stop'

# --- Locate the delivery folder ------------------------------------------------
$PluginDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($PluginDir)) {
  throw 'install.ps1 must run as a saved script file (needs $PSScriptRoot).'
}

# --- Resolve the harness home ---------------------------------------------------
$DshHome = $env:DSH_HOME
if ([string]::IsNullOrEmpty($DshHome)) { $DshHome = Join-Path $env:USERPROFILE '.dsh' }

# --- Locate the harness checkout -------------------------------------------------
$HarnessCandidates = @(
  $HarnessRoot,
  $env:DSH_ROOT,
  'C:\Deepseek-Harness\deepseek-harness-v0.2.0-rc.2',
  'C:\Deepseek-Harness\deepseek-harness'
) | Where-Object { -not [string]::IsNullOrEmpty($_) }

$Harness = $null
foreach ($Root in $HarnessCandidates) {
  if (Test-Path (Join-Path $Root 'vendor/schemastery/lib/index.cjs')) { $Harness = $Root; break }
  if (Test-Path (Join-Path $Root 'apps/cli/package.json')) { $Harness = $Root; break }
}
if ($null -eq $Harness) {
  throw ("Harness checkout not found. Pass it explicitly: install.ps1 -HarnessRoot <path> " +
         "(looked in: $($HarnessCandidates -join '; ')).")
}
Write-Host "Harness checkout : $Harness"

# --- 0. Pre-flight: a broken file must never reach the profile copy ---------------
# A corrupted host.mjs fails the bundle's activation; gate the install on a
# syntax check when node is available.
$Node = Get-Command node -ErrorAction SilentlyContinue
if ($Node) {
  foreach ($CheckFile in @('host.mjs', 'client.js')) {
    $CheckPath = Join-Path $PluginDir $CheckFile
    if (Test-Path $CheckPath) {
      & node --check $CheckPath
      if ($LASTEXITCODE -ne 0) {
        throw "$CheckFile failed the syntax pre-check; the profile copy was NOT touched. Fix the file and run install.ps1 again."
      }
    }
  }
}

# --- 1. Vendor the config-schema library into the bundle -------------------------
# host.mjs requires '@deepseek-ai/schemastery' first; outside the harness tree
# that name does not resolve, so the bundle carries a vendored CJS copy in
# deps\. The CJS build is loaded synchronously (createRequire, no TLA) and
# needs @deepseek-ai/cosmokit beside it (Node 24 require(esm) handles it).
$DepsDir = Join-Path $PluginDir 'deps'
$SchemaSource = Join-Path $Harness 'vendor/schemastery/lib/index.cjs'
$CosmoSource = Join-Path $Harness 'vendor/cosmokit'
if (Test-Path $SchemaSource) {
  New-Item -ItemType Directory -Force -Path (Join-Path $DepsDir 'node_modules/@deepseek-ai/cosmokit/lib') | Out-Null
  Copy-Item -Force $SchemaSource (Join-Path $DepsDir 'schemastery.cjs')
  Copy-Item -Force (Join-Path $CosmoSource 'package.json') (Join-Path $DepsDir 'node_modules/@deepseek-ai/cosmokit/package.json')
  Copy-Item -Force (Join-Path $CosmoSource 'lib/index.js') (Join-Path $DepsDir 'node_modules/@deepseek-ai/cosmokit/lib/index.js')
  Write-Host "Vendored the config-schema library from $Harness."
} elseif (Test-Path (Join-Path $DepsDir 'schemastery.cjs')) {
  Write-Host 'Using the vendored config-schema library already in deps\.'
} else {
  Write-Host 'WARNING: schemastery vendor copy not found and deps\ has none.' -ForegroundColor Yellow
  Write-Host '         The reader runs with defaults; the Plugins-page form is absent.' -ForegroundColor Yellow
}

# --- 2. Remove the legacy file:// row (migration from the pre-bundle flow) -------
# Older installers wrote a managed block into the profile patch pointing at the
# installed copy. With the bundle installed that package would resolve from two
# active sources, which rc.2's client-module scanner refuses. Idempotent strip.
$ProfilePatch = Join-Path $DshHome "profiles/$Profile/cordis.patch.yml"
$RowMarker = '# dsh-text-reader (managed by install.ps1)'
if (Test-Path $ProfilePatch) {
  $ExistingText = [System.IO.File]::ReadAllText($ProfilePatch)
  if ($ExistingText.Contains($RowMarker)) {
    $Existing = $ExistingText -split "`r?`n"
    $Kept = @()
    $SkipRow = $false
    foreach ($Line in $Existing) {
      if ($Line -eq $RowMarker) { $SkipRow = $true; continue }
      if ($SkipRow) {
        # The managed row ends at the first blank line or at a line that starts
        # a new top-level item.
        if ($Line -match '^\s' -or $Line -match '^-' -or $Line -eq '') { continue }
        $SkipRow = $false
      }
      $Kept += $Line
    }
    while ($Kept.Count -gt 0 -and $Kept[$Kept.Count - 1] -eq '') {
      $Kept = if ($Kept.Count -eq 1) { @() } else { $Kept[0..($Kept.Count - 2)] }
    }
    [System.IO.File]::WriteAllText($ProfilePatch, (($Kept -join "`r`n") + "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'Removed the legacy managed row from the profile patch.'
  }
}

# --- 3. Remove the legacy installed copy (old flow artifact) ----------------------
$LegacyCopy = Join-Path $DshHome 'plugins/dsh-text-reader'
if (Test-Path $LegacyCopy) {
  Remove-Item -Recurse -Force $LegacyCopy
  Write-Host 'Removed the legacy installed copy under %DSH_HOME%\plugins.'
}

# --- 4. The official install: a profile bundle from a packed tarball ---------------
# The profile receives a REAL COPY of the package (pnpm installs the tarball),
# so this master folder can be moved or deleted without breaking the running
# plugin. After editing the plugin source, re-run install.ps1 to refresh the
# copy. (A directory spec would instead create a junction back to this folder,
# which dies the moment the folder moves.)
#
# ARTIFACT LIFETIME: the packed .tgz is packed into the profile's .artifacts
# folder and KEPT after the install. The profile manifest references it by its
# file: path, and `dsh plugin add` of ANY bundle resolves EVERY profile
# dependency - a deleted current artifact breaks other bundles' installs (and
# even their remove). Therefore:
#   - pack runs from a staging copy of this folder WITHOUT *.tgz (a temp dir,
#     deleted afterwards), so no old archive can nest inside the new tarball;
#   - the artifact lands in <profile>\.artifacts and the official
#     `dsh plugin add` points the manifest at that path;
#   - after a successful add, only STALE VERSIONS of this package are deleted,
#     pointwise, in .artifacts and in the master folder; the artifact the
#     manifest now references is kept.
Write-Host ''

# The exact artifact name this run will produce: <name>-<version>.tgz.
$Manifest = Get-Content (Join-Path $PluginDir 'package.json') -Raw | ConvertFrom-Json
$ArtifactName = '{0}-{1}.tgz' -f $Manifest.name, $Manifest.version
$ArtifactsDir = Join-Path $DshHome "profiles/$Profile/.artifacts"
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null
$ArtifactPath = Join-Path $ArtifactsDir $ArtifactName

# What does the profile currently reference for this package?
$ProfileManifestPath = Join-Path $DshHome "profiles/$Profile/package.json"
$OldArtifact = $null
if (Test-Path -LiteralPath $ProfileManifestPath) {
  try {
    $OldDep = (Get-Content $ProfileManifestPath -Raw | ConvertFrom-Json).dependencies.($Manifest.name)
  } catch {
    $OldDep = $null
  }
  if ($OldDep -match '^file:(.+\.tgz)$') {
    $OldArtifact = [System.IO.Path]::GetFullPath($Matches[1])
  }
}

# Repoint cases: the manifest references this package at a DIFFERENT path
# (migration to .artifacts) or at a MISSING file (an older scheme deleted its
# artifact). `dsh plugin add` alone may treat the same name+version as up to
# date and keep the old path, so the official remove+add performs the move.
# Before it, preserve the user's live settings: the row's config block
# (edited from the Plugins page) dies with the remove, so mirror its values
# into the bundle's cordis.patch.yml (this workspace file) - the re-add then
# restores the user's values instead of the defaults. Profile is only read;
# the write lands in the workspace.
$ReferencedMissing = ($null -ne $OldArtifact -and -not (Test-Path -LiteralPath $OldArtifact))
$NeedsRepoint = $ReferencedMissing -or ($null -ne $OldArtifact -and $OldArtifact -ne $ArtifactPath)
if ($NeedsRepoint) {
  $ProfilePatchPath = Join-Path $DshHome "profiles/$Profile/cordis.patch.yml"
  $BundlePatchPath = Join-Path $PluginDir 'cordis.patch.yml'
  if ((Test-Path -LiteralPath $ProfilePatchPath) -and (Test-Path -LiteralPath $BundlePatchPath)) {
    $ProfileLines = [System.IO.File]::ReadAllLines($ProfilePatchPath)
    $RowIdx = -1
    for ($i = 0; $i -lt $ProfileLines.Count; $i++) {
      if ($ProfileLines[$i] -match '^\s*-\s+id:\s*text-reader\s*$') { $RowIdx = $i; break }
    }
    if ($RowIdx -ge 0) {
      $RowIndent = $ProfileLines[$RowIdx].Length - $ProfileLines[$RowIdx].TrimStart().Length
      $ConfigVals = @{}
      $InConfig = $false
      $ConfigIndent = 0
      for ($j = $RowIdx + 1; $j -lt $ProfileLines.Count; $j++) {
        $L = $ProfileLines[$j]
        if ($L.Trim() -eq '') { continue }
        $Ind = $L.Length - $L.TrimStart().Length
        if ($Ind -le $RowIndent) { break }
        if ($L.Trim() -eq 'config:') { $InConfig = $true; $ConfigIndent = $Ind; continue }
        if ($InConfig) {
          if ($Ind -le $ConfigIndent) { $InConfig = $false; continue }
          if ($L -match '^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$') { $ConfigVals[$Matches[1]] = $Matches[2].Trim() }
        }
      }
      if ($ConfigVals.Count -gt 0) {
        $BundleLines = [System.IO.File]::ReadAllLines($BundlePatchPath)
        $BIdx = -1
        for ($i = 0; $i -lt $BundleLines.Count; $i++) {
          if ($BundleLines[$i].Trim() -eq 'config:') { $BIdx = $i; break }
        }
        if ($BIdx -ge 0) {
          $BCfgIndent = $BundleLines[$BIdx].Length - $BundleLines[$BIdx].TrimStart().Length
          $Changed = 0
          for ($j = $BIdx + 1; $j -lt $BundleLines.Count; $j++) {
            $L = $BundleLines[$j]
            if ($L.Trim() -eq '') { continue }
            $Ind = $L.Length - $L.TrimStart().Length
            if ($Ind -le $BCfgIndent) { break }
            if ($L -match '^(\s*([A-Za-z_][A-Za-z0-9_]*):\s*)(.*)$') {
              $Key = $Matches[2]
              if ($ConfigVals.ContainsKey($Key) -and $Matches[3] -ne $ConfigVals[$Key]) {
                $BundleLines[$j] = $Matches[1] + $ConfigVals[$Key]
                $Changed++
              }
            }
          }
          if ($Changed -gt 0) {
            [System.IO.File]::WriteAllText($BundlePatchPath, (($BundleLines -join "`r`n") + "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "Preserved $Changed live setting(s) from the profile row into the bundle patch."
          }
        }
      }
    }
  }
  if ($ReferencedMissing) {
    Write-Host "The profile references a missing tarball ($([System.IO.Path]::GetFileName($OldArtifact))); clearing the stale bundle first."
  } else {
    Write-Host 'Re-pointing the profile to the artifact in .artifacts (official remove + add).'
  }
  Push-Location $Harness
  try {
    & pnpm dsh plugin --profile $Profile remove $Manifest.name
    if ($LASTEXITCODE -ne 0) {
      Write-Host "dsh plugin remove reported exit code $LASTEXITCODE (continuing)." -ForegroundColor Yellow
    }
  } finally {
    Pop-Location
  }
  $OldArtifact = $null
}

# Pointwise pre-clean of a legacy leftover: pnpm pack stages "_<name>.zip"
# beside the pack directory; an interrupted OLD-scheme run (pack in the
# master folder) can have left one there. The staging copy below isolates
# the pack anyway.
$StagingZip = Join-Path $PluginDir ('_' + $Manifest.name + '.zip')
if (Test-Path -LiteralPath $StagingZip) {
  Remove-Item -Force -LiteralPath $StagingZip
  Write-Host "Removed the stale pack staging file: $(Split-Path $StagingZip -Leaf)"
}

# Pack from a staging copy WITHOUT *.tgz/*.zip: copying the folder to a temp
# dir (excluding archives), packing there into .artifacts, deleting the temp
# dir. No old archive can end up nested inside the new tarball, and the
# master folder is never the pack directory.
$PackStaging = Join-Path ([System.IO.Path]::GetTempPath()) ('dsh-text-reader-pack-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $PackStaging | Out-Null
& robocopy $PluginDir $PackStaging /E /XF *.tgz *.zip /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
  Remove-Item -Recurse -Force $PackStaging -ErrorAction SilentlyContinue
  throw "Staging copy failed (robocopy exit code $LASTEXITCODE)."
}
Push-Location $PackStaging
try {
  & pnpm pack --pack-destination $ArtifactsDir
  if ($LASTEXITCODE -ne 0) { throw "pnpm pack failed (exit code $LASTEXITCODE)." }
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $PackStaging -ErrorAction SilentlyContinue
}
if (-not (Test-Path -LiteralPath $ArtifactPath)) { throw "pnpm pack produced no $ArtifactName." }
$Bundle = Get-Item -LiteralPath $ArtifactPath
Write-Host "Packed the bundle: $($Bundle.FullName)"

Write-Host "Installing the bundle: pnpm dsh plugin --profile $Profile add `"$($Bundle.FullName)`""
Push-Location $Harness
try {
  & pnpm dsh plugin --profile $Profile add $Bundle.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "dsh plugin add failed (exit code $LASTEXITCODE)."
  }
} finally {
  Pop-Location
}

# The add succeeded and the manifest now references the artifact in
# .artifacts: KEEP it. Only stale versions of this package are deleted,
# pointwise, in .artifacts and in the master folder - deleting the referenced
# artifact would break every other bundle's install (their add resolves all
# profile dependencies).
$StaleFilter = $Manifest.name + '-*.tgz'
Get-ChildItem -LiteralPath $ArtifactsDir -Filter $StaleFilter -File |
  Where-Object { $_.Name -ne $ArtifactName } |
  ForEach-Object {
    Remove-Item -Force -LiteralPath $_.FullName
    Write-Host "Removed the stale artifact: $($_.Name)"
  }
Get-ChildItem -LiteralPath $PluginDir -Filter $StaleFilter -File |
  Where-Object { $_.Name -ne $ArtifactName } |
  ForEach-Object {
    Remove-Item -Force -LiteralPath $_.FullName
    Write-Host "Removed the stale artifact in the master folder: $($_.Name)"
  }

Write-Host ''
Write-Host 'dsh-text-reader installed as a profile bundle.' -ForegroundColor Green
Write-Host "  master folder : $PluginDir (portable - move or delete it freely, the profile holds its own copy)"
Write-Host "  profile copy  : $DshHome\profiles\$Profile\node_modules\dsh-text-reader (refreshed by install.ps1)"
Write-Host "  artifact      : $ArtifactPath (kept - the profile manifest references it)"
Write-Host ''
Write-Host 'Restart "pnpm dsh web" if the harness was running. The Plugins page then'
Write-Host 'lists Text reader with the enable switch and the settings form.'
Write-Host 'To uninstall later, run uninstall.ps1.'
