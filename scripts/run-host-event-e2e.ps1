param(
  [ValidateSet("CASUAL", "TOURNAMENT")]
  [string]$EventType,
  [ValidateRange(1, 5)]
  [int]$RoundCount = 2,
  [int]$WorkerPort = 8790,
  [int]$TimeoutSeconds = 180,
  [string]$CargoTargetRoot = "",
  [switch]$SkipHostDisconnect
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$scenario = "host-event-$($EventType.ToLowerInvariant())"
$runtimeRoot = Join-Path $repoRoot "testdata\runtime\e2e\$scenario-$timestamp"
$artifactRoot = Join-Path $runtimeRoot "artifacts"
$workerLog = Join-Path $runtimeRoot "logs\host-event-worker.log"
$frontendLog = Join-Path $runtimeRoot "logs\client-dev.log"
$apiBaseUrl = "http://127.0.0.1:$WorkerPort"
$workerProcess = $null
$frontendProcess = $null
$participantsProcess = $null

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class HostEventE2EWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr handle, int x, int y, int width, int height, bool repaint);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr handle, IntPtr after, int x, int y, int width, int height, uint flags);
}
"@

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
  Ensure-Directory (Split-Path -Parent $Path)
  [System.IO.File]::WriteAllText($Path, ($Content -replace "`r?`n", "`n"), [System.Text.UTF8Encoding]::new($false))
}

function Test-Port([int]$Port) {
  try { return (Test-NetConnection 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue) } catch { return $false }
}

function Wait-Port([int]$Port, [int]$Seconds = 45) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $Port) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "Port $Port did not open."
}

function Start-HiddenProcess([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory, [string]$LogPath) {
  Ensure-Directory (Split-Path -Parent $LogPath)
  return Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $LogPath -RedirectStandardError "$LogPath.err" -PassThru
}

function Stop-Tree([int]$RootId) {
  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $children = @{}
  foreach ($process in $all) {
    $parent = [int]$process.ParentProcessId
    if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }
    $children[$parent] += [int]$process.ProcessId
  }
  $ids = [System.Collections.Generic.List[int]]::new()
  $visited = [System.Collections.Generic.HashSet[int]]::new()
  function Add-Children([int]$ParentId) {
    if (-not $visited.Add($ParentId)) { return }
    foreach ($child in @($children[$ParentId])) { Add-Children $child; $ids.Add($child) }
  }
  Add-Children $RootId
  $ids.Add($RootId)
  foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
}

function Read-State([string]$Path) {
  try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

function Wait-State([string]$Path, [string]$Description, [ScriptBlock]$Predicate) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $Path) {
      $value = Read-State $Path
      if ($value -and (& $Predicate $value)) { return $value }
    }
    Start-Sleep -Milliseconds 300
  }
  throw "Timed out waiting for $Description ($Path)."
}

function Wait-Event([string]$Path, [string]$Name) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $Path) {
      foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        try { $entry = $line | ConvertFrom-Json -ErrorAction Stop } catch { continue }
        if ($entry.event -eq $Name) { return $entry }
      }
    }
    Start-Sleep -Milliseconds 300
  }
  throw "Timed out waiting for event $Name ($Path)."
}

function Write-Reflux([string]$WatchDir, [object]$ExpectedKey, [int]$Score, [int]$Misscount) {
  $difficultyCode = switch ([string]$ExpectedKey.difficulty) {
    "BEGINNER" { "B" }; "NORMAL" { "N" }; "HYPER" { "H" }; "ANOTHER" { "A" }; "LEGGENDARIA" { "L" }
  }
  $now = Get-Date
  $payload = [ordered]@{
    timestamp = $now.ToString("yyyyMMdd-HHmmssfff")
    title = [string]$ExpectedKey.title_search_key
    title2 = [string]$ExpectedKey.title_search_key
    diff = "$($ExpectedKey.play_style)$difficultyCode"
    exscore = [string]$Score
    bad = [string][Math]::Floor($Misscount / 2)
    poor = [string][Math]::Ceiling($Misscount / 2)
    assist = "OFF"
    lamp = "AC"
    playtype = [string]$ExpectedKey.play_style
  }
  Write-Utf8NoBomFile (Join-Path $WatchDir "latest.json") (($payload | ConvertTo-Json -Depth 6) + "`n")
}

function Capture-ClientWindow([string]$Profile, [string]$Label, [string]$ExpectedRole, [string]$ExpectedPhase, [string]$ExpectedRoundPhase = "", [switch]$Mobile, [switch]$Background) {
  $statePath = Join-Path $runtimeRoot "runtime\$Profile\$Profile.state.json"
  $expectedView = if ($Background) { "lobby" } else { "event-room" }
  $state = Wait-State $statePath "rendered event view $Profile/$Label" { param($value) $visible = $value.state.visualLayout; $snapshot = $value.state.eventRoom.snapshot; return $value.state.activeView -eq $expectedView -and ($Background -or $visible.eventMainActionPresent) -and $value.state.eventRoom.sessionRole -eq $ExpectedRole -and $snapshot.phase -eq $ExpectedPhase -and (-not $ExpectedRoundPhase -or $snapshot.round_phase -eq $ExpectedRoundPhase) -and ($Background -or ($ExpectedPhase -notin @("LOBBY", "PICKING") -and $ExpectedRoundPhase -ne "ACTIVE") -or $visible.eventPlayerCards -eq 20) }
  $event = $state.state.eventRoom
  if (-not $event -or $event.sessionRole -ne $ExpectedRole -or $event.snapshot.phase -ne $ExpectedPhase -or ($ExpectedRoundPhase -and $event.snapshot.round_phase -ne $ExpectedRoundPhase)) {
    throw "Visual state mismatch for $Profile/$Label (role=$($event.sessionRole), phase=$($event.snapshot.phase), round=$($event.snapshot.round_phase))."
  }
  if ($Background) {
    if ($state.state.visualLayout.eventPlayerCards -ne 0) { throw "Expected the normal lobby while retaining the event connection." }
  } elseif ($ExpectedPhase -eq "LOBBY" -or $ExpectedPhase -eq "PICKING" -or $ExpectedRoundPhase -eq "ACTIVE") {
    if ($state.state.visualLayout.eventPlayerCards -ne 20) { throw "Expected 20 rendered cards for $Profile/$Label." }
  } elseif (-not $state.state.visualLayout.eventText.Contains("結果")) { throw "Expected rendered results for $Profile/$Label." }
  $title = "INFINITAS ARENA Client (E2E $Profile)"
  $deadline = (Get-Date).AddSeconds(10)
  $process = $null
  while ((Get-Date) -lt $deadline) {
    $process = Get-Process | Where-Object { $_.MainWindowTitle -eq $title -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($process) { break }
    Start-Sleep -Milliseconds 200
  }
  if (-not $process) { throw "Tauri window not found for screenshot: $title" }
  [HostEventE2EWindow]::ShowWindow($process.MainWindowHandle, 9) | Out-Null
  [HostEventE2EWindow]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
  if ($Mobile) { [HostEventE2EWindow]::MoveWindow($process.MainWindowHandle, 20, 20, 390, 844, $true) | Out-Null }
  Start-Sleep -Milliseconds 750
  $state = Wait-State $statePath "native viewport resize and footer $Profile/$Label" { param($value) $layout = $value.state.visualLayout; return $value.state.activeView -eq $expectedView -and ($Background -or ($layout.eventMainActionPresent -and $layout.eventMainActionBottom -le $layout.viewportHeight)) -and -not $layout.hasHorizontalOverflow -and (-not $Mobile -or ($layout.viewportWidth -le 390 -and $layout.viewportWidth -ge 300)) }
  $rect = [HostEventE2EWindow+Rect]::new()
  if (-not [HostEventE2EWindow]::GetWindowRect($process.MainWindowHandle, [ref]$rect)) { throw "Failed to read Tauri window bounds: $title" }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) { throw "Invalid Tauri window bounds: ${width}x${height}" }
  $bitmap = [System.Drawing.Bitmap]::new($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    if (-not [HostEventE2EWindow]::SetWindowPos($process.MainWindowHandle, [IntPtr]::new(-1), 0, 0, 0, 0, 3)) { throw "Unable to raise task-owned Tauri window: $title" }
    Start-Sleep -Milliseconds 750
    # PrintWindow may report success while WebView2 returns a stale startup surface.
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    $path = Join-Path $runtimeRoot "runtime\$Profile\$Profile.$Label.png"
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $record = [ordered]@{ profile=$Profile; label=$Label; session_role=$event.sessionRole; phase=$event.snapshot.phase; round_phase=$event.snapshot.round_phase; player_id=$event.playerId; viewport=@{ width=$width; height=$height }; image_path=$path; active_view=$state.state.activeView; rendered_cards=$state.state.visualLayout.eventPlayerCards; rendered_result_rows=$state.state.visualLayout.eventResultRows; rendered_main_action=$state.state.visualLayout.eventMainActionPresent; actual_layout=$state.state.visualLayout }
    [System.IO.File]::AppendAllText((Join-Path $runtimeRoot "visual-evidence.jsonl"), (($record | ConvertTo-Json -Compress -Depth 6) + "`n"), [System.Text.UTF8Encoding]::new($false))
  } finally {
    [HostEventE2EWindow]::SetWindowPos($process.MainWindowHandle, [IntPtr]::new(-2), 0, 0, 0, 0, 3) | Out-Null
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

Ensure-Directory $artifactRoot
$npm = (Get-Command npm).Source
try {
  if (Test-Port $WorkerPort) { throw "WorkerPort $WorkerPort is already in use." }
  $workerProcess = Start-HiddenProcess $npm @("exec", "--", "wrangler", "dev", "--port", "$WorkerPort", "--var", "HOST_EVENT_ACCEPT_NEW:true") (Join-Path $repoRoot "apps\worker") $workerLog
  Wait-Port $WorkerPort
  if (-not (Test-Port 1420)) {
    $frontendProcess = Start-HiddenProcess $npm @("--workspace", "@infinitas/client", "run", "dev") $repoRoot $frontendLog
    Wait-Port 1420
  }

  $joinCode = "R6TEST88"
  $hostPlays = $EventType -eq "TOURNAMENT"
  $createBody = @{
    host_event_protocol = 2
    client_version = "1.4.0"
    host_player_id = "e2e-client-a"
    host_display_name = "E2E1"
    settings = @{
      event_name = "Issue 188 $EventType E2E"
      event_type = $EventType
      host_plays = $hostPlays
      play_style = "SP"
      win_metric = "SCORE"
      visibility = "PRIVATE"
      join_code = $joinCode
    }
  }
  $created = Invoke-RestMethod -Uri "$apiBaseUrl/api/event-rooms" -Method Post -ContentType "application/json; charset=utf-8" -Body ($createBody | ConvertTo-Json -Depth 10)
  $roomId = [string]$created.room_id
  if ([string]::IsNullOrWhiteSpace($roomId)) { throw "Host Event creation returned no room_id." }

  $peerCount = if ($hostPlays) { 18 } else { 19 }
  $peersEvidence = Join-Path $runtimeRoot "ws-participants.json"
  $participantsProcess = Start-HiddenProcess (Get-Command node).Source @((Join-Path $repoRoot "testdata/e2e/host-event/ws-participants.mjs"), $apiBaseUrl, $roomId, "$peerCount", $peersEvidence) $repoRoot (Join-Path $runtimeRoot "logs/ws-participants.log")

  & (Join-Path $PSScriptRoot "start-local-two-clients.ps1") -ClientCount 2 -RuntimeRoot $runtimeRoot -CargoTargetRoot $CargoTargetRoot -E2E -Scenario $scenario -E2EMatchCount 1 -RoomId $roomId -JoinCode $joinCode -ApiBaseUrl $apiBaseUrl -RoomKind HOST_EVENT -EventRoundCount $RoundCount -EventDisconnectHost:(-not $SkipHostDisconnect) -ClientASource reflux -ClientBSource reflux -SkipWorker -SkipFrontend

  $stateA = Join-Path $runtimeRoot "runtime\client-a\client-a.state.json"
  $stateB = Join-Path $runtimeRoot "runtime\client-b\client-b.state.json"
  $eventsA = Join-Path $runtimeRoot "logs\client-a\client-a.events.jsonl"
  $eventsB = Join-Path $runtimeRoot "logs\client-b\client-b.events.jsonl"
  Wait-State $stateA "Host Event LOBBY" { param($value) $value.state.eventRoom.snapshot.phase -eq "LOBBY" } | Out-Null
  Capture-ClientWindow "client-a" "event-lobby" "HOST" "LOBBY"
  Wait-State $stateB "Client Host Event LOBBY" { param($value) $value.state.eventRoom.sessionRole -eq "PLAYER" -and $value.state.eventRoom.snapshot.phase -eq "LOBBY" } | Out-Null
  Capture-ClientWindow "client-b" "event-lobby" "PLAYER" "LOBBY"
  Wait-State $stateA "Host Event PICKING round 1" { param($value) $value.state.eventRoom.snapshot.phase -eq "PICKING" } | Out-Null
  Capture-ClientWindow "client-a" "event-picking-round-1" "HOST" "PICKING"
  Wait-State $stateB "Client Host Event PICKING round 1" { param($value) $value.state.eventRoom.sessionRole -eq "PLAYER" -and $value.state.eventRoom.snapshot.phase -eq "PICKING" } | Out-Null
  Capture-ClientWindow "client-b" "event-picking-round-1" "PLAYER" "PICKING"
  for ($round = 0; $round -lt $RoundCount; $round++) {
    $active = Wait-State $stateA "Host Event ACTIVE round $($round + 1)" {
      param($value)
      $event = $value.state.eventRoom
      return $event.snapshot -and $event.snapshot.phase -eq "PLAYING" -and $event.snapshot.round_phase -eq "ACTIVE" -and @($event.resultRounds).Count -eq $round
    }
    if ($round -eq 0) {
      Capture-ClientWindow "client-a" "event-active-round-1" "HOST" "PLAYING" "ACTIVE"
      Wait-State $stateB "Client Host Event ACTIVE round 1" { param($value) $value.state.eventRoom.sessionRole -eq "PLAYER" -and $value.state.eventRoom.snapshot.phase -eq "PLAYING" -and $value.state.eventRoom.snapshot.round_phase -eq "ACTIVE" } | Out-Null
      Capture-ClientWindow "client-b" "event-active-round-1" "PLAYER" "PLAYING" "ACTIVE"
    }
    if (@($active.state.eventRoom.snapshot.current_playing_player_ids).Count -ne 20) { throw "Expected 20 playing participants in the Tauri room." }
    if ($round -eq 1) {
      $backgroundEventPaths = @($eventsB)
      if ($hostPlays) { $backgroundEventPaths += $eventsA }
      foreach ($backgroundEventPath in $backgroundEventPaths) {
        $backgroundStarted = Wait-Event $backgroundEventPath "event_background_submission_started"
        if ([string]::IsNullOrWhiteSpace($backgroundStarted.roundId) -or $backgroundStarted.roundId -ne $active.state.eventRoom.snapshot.current_round_id -or $backgroundStarted.activeView -ne "lobby" -or $backgroundStarted.roundNumber -ne 2 -or $backgroundStarted.phase -ne "PLAYING" -or $backgroundStarted.roundPhase -ne "ACTIVE") {
          throw "Expected background submission to start in the normal lobby during the same non-null second ACTIVE round."
        }
      }
      Capture-ClientWindow "client-b" "event-background-submission" "PLAYER" "PLAYING" "ACTIVE" -Background
    }
    $expected = $active.state.eventRoom.snapshot.selected_chart.expected_key
    if ($hostPlays) { Write-Reflux (Join-Path $runtimeRoot "watch\client-a") $expected (2600 + $round * 20) (8 + $round) }
    Start-Sleep -Milliseconds 400
    Write-Reflux (Join-Path $runtimeRoot "watch\client-b") $expected (2500 + $round * 20) (10 + $round)
    Wait-State $stateA "published result $($round + 1)" {
      param($value)
      return @($value.state.eventRoom.resultRounds).Count -ge ($round + 1)
    } | Out-Null
    if ($round -eq 0) {
      Wait-State $stateB "Client round result visual state" { param($value) $value.state.eventRoom.sessionRole -eq "PLAYER" -and $value.state.eventRoom.snapshot.round_phase -eq "RESULT" } | Out-Null
      Capture-ClientWindow "client-b" "event-result-round-1" "PLAYER" "PLAYING" "RESULT"
      if (-not $SkipHostDisconnect) {
        Wait-Event $eventsB "event_host_disconnected_observed" | Out-Null
        Capture-ClientWindow "client-b" "event-host-disconnected" "PLAYER" "PLAYING" "RESULT"
        Wait-Event $eventsA "event_host_reconnected_observed" | Out-Null
      }
    }
  }
  $final = Wait-State $stateA "authoritative final result" {
    param($value)
    $event = $value.state.eventRoom
    return $event.snapshot -and $event.snapshot.phase -eq "RESULT" -and $event.resultsSyncComplete -and @($event.resultRounds).Count -eq $RoundCount
  }
  Wait-Event $eventsA "event_history_reloaded" | Out-Null
  Wait-Event $eventsB "event_history_reloaded" | Out-Null
  $background = Wait-Event $eventsB "event_background_submission_accepted"
  if ($background.activeView -ne "lobby" -or $background.roundStatus -ne "SUBMITTED") { throw "Expected server-confirmed submission while the participant viewed the normal lobby." }
  Start-Sleep -Milliseconds 750
  Capture-ClientWindow "client-a" "event-final" "HOST" "RESULT"
  Wait-State $stateB "Client final result visual state" { param($value) $value.state.eventRoom.sessionRole -eq "PLAYER" -and $value.state.eventRoom.snapshot.phase -eq "RESULT" } | Out-Null
  Capture-ClientWindow "client-b" "event-final-mobile" "PLAYER" "RESULT" "" -Mobile

  if (@($final.state.eventRoom.resultRounds | Where-Object { @($_.results).Count -ne 20 }).Count -gt 0) { throw "Expected 20 result rows per Tauri round." }
  $peers = Wait-State $peersEvidence "WS peers completed two rounds" { param($value) return @($value.peers | Where-Object { -not $_.final -or @($_.submissions).Count -ne $RoundCount -or @($_.rounds).Count -ne $RoundCount -or @($_.errors).Count -gt 0 }).Count -eq 0 }
  Copy-Item -LiteralPath $peersEvidence -Destination (Join-Path $artifactRoot "ws-participants.json") -Force

  $expectedImages = @(
    "client-a.event-lobby.png",
    "client-b.event-lobby.png",
    "client-a.event-picking-round-1.png",
    "client-b.event-picking-round-1.png",
    "client-a.event-active-round-1.png",
    "client-b.event-active-round-1.png",
    "client-b.event-result-round-1.png",
    "client-b.event-background-submission.png",
    "client-a.event-final.png",
    "client-b.event-final-mobile.png"
  )
  if (-not $SkipHostDisconnect) { $expectedImages += "client-b.event-host-disconnected.png" }
  $missingImages = @($expectedImages | Where-Object { -not (Test-Path -LiteralPath (Join-Path $runtimeRoot "runtime\$($_.Split('.')[0])\$_")) })
  if ($missingImages.Count -gt 0) { throw "Missing visual evidence: $($missingImages -join ', ')" }

  $summary = @(
    "# Host Event local E2E",
    "",
    "- event_type: $EventType",
    "- host_plays: $hostPlays",
    "- round_count: $RoundCount",
    "- same_room_participants: 20 (2 real Tauri plus $peerCount WS peers; dedicated Host uses a separate connection)",
    "- result_rows_per_round: 20",
    "- room_id: $roomId",
    "- host_disconnect_observed: $(if ($SkipHostDisconnect) { 'SKIPPED (separate asserted run)' } else { 'PASS' })",
    "- history_reload: PASS",
    "- submission_while_viewing_normal_lobby: PASS",
    "- screenshots: PASS",
    "- result: PASS"
  ) -join "`n"
  $summaryPath = Join-Path $artifactRoot "summary-$timestamp.md"
  Write-Utf8NoBomFile $summaryPath ($summary + "`n")
  Copy-Item -LiteralPath (Join-Path $runtimeRoot "visual-evidence.jsonl") -Destination (Join-Path $artifactRoot "visual-evidence.jsonl") -Force
  foreach ($profile in @("client-a", "client-b")) {
    Copy-Item -LiteralPath (Join-Path $runtimeRoot "runtime\$profile\$profile.state.json") -Destination (Join-Path $artifactRoot "$profile.state.json") -Force
    Copy-Item -LiteralPath (Join-Path $runtimeRoot "logs\$profile\$profile.events.jsonl") -Destination (Join-Path $artifactRoot "$profile.events.jsonl") -Force
    Get-ChildItem (Join-Path $runtimeRoot "runtime\$profile") -Filter "$profile.event-*.png" | Copy-Item -Destination $artifactRoot -Force
  }
  Write-Host "Host Event E2E passed: $EventType" -ForegroundColor Green
  Write-Host "Artifacts: $artifactRoot"
} finally {
  $registry = Join-Path $runtimeRoot "client-launchers.json"
  if (Test-Path -LiteralPath $registry) {
    foreach ($launcherId in @(((Get-Content $registry -Raw -Encoding UTF8 | ConvertFrom-Json).process_ids))) { Stop-Tree ([int]$launcherId) }
  }
  if ($participantsProcess) { Stop-Tree $participantsProcess.Id }
  if ($workerProcess) { Stop-Tree $workerProcess.Id }
  if ($frontendProcess) { Stop-Tree $frontendProcess.Id }
}
