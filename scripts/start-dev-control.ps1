param(
  [ValidateSet('ARENA','BPL','BPL4','CASUAL','TOURNAMENT')][string]$Mode = 'ARENA',
  [ValidateSet('A','B')][string]$HostClient = 'B',
  [ValidateSet('inf-notebook','reflux','daken_counter_v3')][string]$SelfSource = 'daken_counter_v3',
  [string]$SelfDirectory = '',
  [ValidateRange(1,65535)][int]$SelfPort = 8767,
  [ValidateSet('inf-notebook','reflux','daken_counter_v3')][string]$OpponentSource = 'inf-notebook',
  [ValidateRange(1,19)][int]$VisibleOpponents = 1,
  [ValidateRange(2,20)][int]$PlayerCount = 4,
  [string]$RestartFrom = '',
  [string]$RestartOptionsFrom = '',
  [string]$ReopenFrom = '',
  [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$entry = Join-Path $PSScriptRoot 'dev-control/launch.mjs'
if ($ReopenFrom) {
  & node $entry --reopen $ReopenFrom
} elseif ($RestartFrom) {
  $restartArgs = @('--restart', $RestartFrom)
  if ($RestartOptionsFrom) { $restartArgs += @('--restart-options', $RestartOptionsFrom) }
  & node $entry @restartArgs
} else {
  $launchArgs = @('--mode', $Mode, '--host', $HostClient, '--self-source', $SelfSource, '--self-port', [string]$SelfPort, '--opponent-source', $OpponentSource, '--visible', [string]$VisibleOpponents, '--players', [string]$PlayerCount, '--prepare-only', [string][bool]$PrepareOnly)
  if ($SelfDirectory) { $launchArgs += @('--self-directory', $SelfDirectory) }
  & node $entry @launchArgs
}
if ($LASTEXITCODE -ne 0) { throw 'Dev control launch failed; see the session launch-state.json and logs.' }
