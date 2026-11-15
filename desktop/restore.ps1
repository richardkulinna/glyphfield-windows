param([int]$ParentId, [string]$Profile, [string]$SavedProfile, [string]$Installer, [string]$Executable, [string]$Backups)
$ErrorActionPreference = 'Stop'
try {
  Wait-Process -Id $ParentId -ErrorAction SilentlyContinue
  $resolvedBackups = [IO.Path]::GetFullPath($Backups).TrimEnd('\') + '\'
  $resolvedSaved = [IO.Path]::GetFullPath($SavedProfile)
  $resolvedInstaller = [IO.Path]::GetFullPath($Installer)
  if (!$resolvedSaved.StartsWith($resolvedBackups, [StringComparison]::OrdinalIgnoreCase) -or !$resolvedInstaller.StartsWith($resolvedBackups, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid backup paths' }
  $expectedProfile = Join-Path $env:APPDATA 'Glyphfield Windows'
  if ([IO.Path]::GetFullPath($Profile) -ne [IO.Path]::GetFullPath($expectedProfile)) { throw 'Unexpected profile path' }
  # Preserve the newer data as well. Never overwrite or delete the only copy.
  $recovery = Join-Path $Backups ('before-rollback-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Move-Item -LiteralPath $Profile -Destination $recovery
  Copy-Item -LiteralPath $SavedProfile -Destination $Profile -Recurse
  $result = Start-Process -FilePath $Installer -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  if ($result.ExitCode -ne 0) { throw "Installer exit code $($result.ExitCode). Newer data preserved at $recovery" }
  # Suppress this rejected update until the user explicitly resumes checks.
  Set-Content -LiteralPath (Join-Path $Backups 'updates-paused') -Value 'rollback'
  Start-Process -FilePath $Executable -WindowStyle Hidden
} catch {
  $_ | Out-File -LiteralPath (Join-Path $Backups 'restore-error.txt')
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Wiederherstellung nicht abgeschlossen. Deine Daten bleiben in den Sicherungen erhalten. Details: $Backups\restore-error.txt", 'Glyphfield Wiederherstellung')
}
