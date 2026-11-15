param([int]$ParentId, [string]$Profile, [string]$Backups, [string]$PreviousInstaller, [string]$PreviousHash, [string]$Version, [string]$Installer, [string]$Executable)
$ErrorActionPreference = 'Stop'
try {
  Wait-Process -Id $ParentId -ErrorAction SilentlyContinue
  $expectedProfile = Join-Path $env:APPDATA 'Glyphfield Windows'
  if ([IO.Path]::GetFullPath($Profile) -ne [IO.Path]::GetFullPath($expectedProfile)) { throw 'Unexpected profile path' }
  if ((Get-FileHash -LiteralPath $PreviousInstaller -Algorithm SHA256).Hash.ToLowerInvariant() -ne $PreviousHash) { throw 'Previous installer checksum mismatch' }
  $directory = Join-Path $Backups ('rollback-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-v' + $Version)
  New-Item -ItemType Directory -Path $directory | Out-Null
  $saved = Join-Path $directory 'profile'
  # Chromium has exited: IndexedDB/LevelDB files are no longer locked or being written.
  Copy-Item -LiteralPath $Profile -Destination $saved -Recurse
  $record = @{ version = $Version; profile = $saved; installer = $PreviousInstaller; sha256 = $PreviousHash; created = (Get-Date).ToUniversalTime().ToString('o') }
  $record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Backups 'rollback.json') -Encoding UTF8
  $result = Start-Process -FilePath $Installer -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  if ($result.ExitCode -ne 0) { throw "Installer exit code $($result.ExitCode)" }
  Start-Process -FilePath $Executable -WindowStyle Hidden
} catch {
  $_ | Out-File -LiteralPath (Join-Path $Backups 'install-error.txt')
  if ($env:GLYPHFIELD_HELPER_TEST -eq '1') { throw }
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Update nicht abgeschlossen. Die Sicherung bleibt erhalten. Details: $Backups\install-error.txt", 'Glyphfield Update')
}
