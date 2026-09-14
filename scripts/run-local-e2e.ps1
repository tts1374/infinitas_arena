param(
  [ValidateSet("reflux-reflux-full", "mixed-daken-v3-notebook")]
  [string]$Scenario = "reflux-reflux-full",
  [ValidateRange(1, 3)]
  [int]$MatchCount = 1,
  [string]$CargoTargetRoot = "",
  [ValidateSet("ARENA", "BPL", "BPL4")]
  [string]$Mode = "ARENA",
  [string]$RuntimeRoot = "",
  [int]$TimeoutSeconds = 240,
  [switch]$SkipWorker,
  [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
  $directory = Split-Path -Parent $Path
  if ($directory) {
    Ensure-Directory $directory
  }
  $encoding = [System.Text.UTF8Encoding]::new($false)
  $normalized = $Content -replace "`r?`n", "`n"
  [System.IO.File]::WriteAllText($Path, $normalized, $encoding)
}

function Read-Utf8Text([string]$Path) {
  $encoding = [System.Text.UTF8Encoding]::new($false, $true)
  return [System.IO.File]::ReadAllText($Path, $encoding)
}

function Copy-IfExists([string]$SourcePath, [string]$TargetPath) {
  if (-not (Test-Path -LiteralPath $SourcePath)) {
    return
  }
  Ensure-Directory (Split-Path -Parent $TargetPath)
  Copy-Item -LiteralPath $SourcePath -Destination $TargetPath -Force
}

function Test-PortOpen([int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $asyncResult = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $asyncResult.AsyncWaitHandle.WaitOne(500)) {
      return $false
    }
    $client.EndConnect($asyncResult)
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Wait-PortOpen([int]$Port, [string]$Label, [int]$WaitSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen $Port) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "$Label did not open port $Port within $WaitSeconds seconds."
}

function Start-LoggedPowerShell(
  [string]$Title,
  [string]$WorkingDirectory,
  [string]$Command,
  [string]$LogPath
) {
  $titleLiteral = $Title.Replace("'", "''")
  $workingLiteral = $WorkingDirectory.Replace("'", "''")
  $logLiteral = $LogPath.Replace("'", "''")
  $commandLiteral = $Command.Replace("'", "''")
  $launcherPath = [System.IO.Path]::ChangeExtension($LogPath, ".launcher.ps1")

  $scriptLines = @(
    "`$ErrorActionPreference = 'Stop'"
    "`$Host.UI.RawUI.WindowTitle = '$titleLiteral'"
    "Set-Location '$workingLiteral'"
    "Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue"
    "Remove-Item Env:VSCODE_INSPECTOR_OPTIONS -ErrorAction SilentlyContinue"
    "& { $commandLiteral } 2>&1 | Tee-Object -FilePath '$logLiteral'"
  )

  if (-not (Test-Path -LiteralPath $LogPath)) {
    Write-Utf8NoBomFile -Path $LogPath -Content ""
  }
  Write-Utf8NoBomFile -Path $launcherPath -Content (($scriptLines -join "`n") + "`n")
  $pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
  $shellExe = if ($pwshCommand) { $pwshCommand.Source } else { "powershell" }
  Start-Process -FilePath $shellExe -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $launcherPath | Out-Null
}

function Wait-E2EEvent(
  [string]$LogPath,
  [string]$EventName,
  [int]$AfterLine = 0,
  [int]$WaitSeconds = 120,
  [ScriptBlock]$Predicate = { param($entry) $true }
) {
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-Path -LiteralPath $LogPath)) {
      Start-Sleep -Milliseconds 300
      continue
    }

    $lines = Get-Content -LiteralPath $LogPath -Encoding UTF8
    if ($lines.Count -le $AfterLine) {
      Start-Sleep -Milliseconds 300
      continue
    }

    for ($index = $AfterLine; $index -lt $lines.Count; $index++) {
      $line = $lines[$index]
      if ([string]::IsNullOrWhiteSpace($line)) {
        continue
      }

      try {
        $entry = $line | ConvertFrom-Json -ErrorAction Stop
      } catch {
        continue
      }

      if ($entry.event -ne $EventName) {
        continue
      }

      if (-not (& $Predicate $entry)) {
        continue
      }

      return [pscustomobject]@{
        Entry = $entry
        Line = $index + 1
      }
    }

    Start-Sleep -Milliseconds 300
  }

  throw "Timed out waiting for event '$EventName' in $LogPath."
}

function Wait-StateDump(
  [string]$StatePath,
  [ScriptBlock]$Predicate,
  [string]$Description,
  [int]$WaitSeconds = 120
) {
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-Path -LiteralPath $StatePath)) {
      Start-Sleep -Milliseconds 300
      continue
    }

    try {
      $state = (Read-Utf8Text $StatePath) | ConvertFrom-Json -Depth 30 -ErrorAction Stop
    } catch {
      Start-Sleep -Milliseconds 300
      continue
    }

    if (& $Predicate $state) {
      return $state
    }

    Start-Sleep -Milliseconds 300
  }

  throw "Timed out waiting for state condition: $Description ($StatePath)"
}

function Stop-ProcessTree([int]$ProcessId) {
  $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $childrenByParent = @{}
  foreach ($process in $processes) {
    $parentId = [int]$process.ParentProcessId
    if (-not $childrenByParent.ContainsKey($parentId)) {
      $childrenByParent[$parentId] = @()
    }
    $childrenByParent[$parentId] += [int]$process.ProcessId
  }

  $ordered = [System.Collections.Generic.List[int]]::new()
  $visited = [System.Collections.Generic.HashSet[int]]::new()
  function Add-Descendants([int]$ParentId) {
    if (-not $visited.Add($ParentId)) { return }
    foreach ($childId in @($childrenByParent[$ParentId])) {
      Add-Descendants -ParentId $childId
      $ordered.Add($childId)
    }
  }
  Add-Descendants -ParentId $ProcessId
  $ordered.Add($ProcessId)
  foreach ($id in $ordered) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
}

function Build-DiffCode([string]$PlayStyle, [string]$Difficulty) {
  $style = $PlayStyle.Trim().ToUpperInvariant()
  $difficultyToken = switch ($Difficulty.Trim().ToUpperInvariant()) {
    "BEGINNER" { "B" }
    "NORMAL" { "N" }
    "HYPER" { "H" }
    "ANOTHER" { "A" }
    "LEGGENDARIA" { "L" }
    default { throw "Unsupported difficulty: $Difficulty" }
  }
  return "$style$difficultyToken"
}

function Build-Timestamp() {
  return (Get-Date).ToString("yyyyMMdd-HHmmss")
}

function Resolve-HistoryMode([string]$RoomMode) {
  if ($RoomMode -eq "ARENA") {
    return "ARENA"
  }
  if ($RoomMode -eq "BPL" -or $RoomMode -eq "BPL4") {
    return "BPL"
  }
  throw "Unsupported history mode: $RoomMode"
}

function Write-RefluxFixture(
  [string]$WatchDir,
  [string]$Title,
  [string]$PlayStyle,
  [string]$Difficulty,
  [int]$Score,
  [int]$Misscount,
  [string]$FixtureArchiveDir
) {
  $diff = Build-DiffCode -PlayStyle $PlayStyle -Difficulty $Difficulty
  $trackerPath = Join-Path $WatchDir "tracker.tsv"
  $latestPath = Join-Path $WatchDir "latest.json"
  $timestamp = Build-Timestamp
  $bad = [Math]::Floor($Misscount / 2)
  $poor = $Misscount - $bad

  $trackerContent = "title`t$diff Lamp`t$diff EX Score`t$diff Miss Count`n$Title`tAC`t$($Score + 50)`t$([Math]::Max($Misscount - 2, 0))`n"
  $latestPayload = [ordered]@{
    timestamp = $timestamp
    title = $Title
    title2 = $Title
    diff = $diff
    exscore = "$Score"
    bad = "$bad"
    poor = "$poor"
    assist = "OFF"
    lamp = "AC"
    playtype = $PlayStyle
  }

  Ensure-Directory $WatchDir
  Ensure-Directory $FixtureArchiveDir
  Write-Utf8NoBomFile -Path $trackerPath -Content $trackerContent
  Write-Utf8NoBomFile -Path $latestPath -Content (($latestPayload | ConvertTo-Json -Depth 10) + "`n")
  Copy-IfExists -SourcePath $trackerPath -TargetPath (Join-Path $FixtureArchiveDir "tracker.tsv")
  Copy-IfExists -SourcePath $latestPath -TargetPath (Join-Path $FixtureArchiveDir "latest.json")
}

function Write-NotebookFixture(
  [string]$WatchDir,
  [string]$Title,
  [string]$PlayStyle,
  [string]$Difficulty,
  [int]$Score,
  [int]$Misscount,
  [string]$FixtureArchiveDir
) {
  $summaryPath = Join-Path $WatchDir "records\summary.json"
  $recentPath = Join-Path $WatchDir "export\recent.json"
  $timestamp = Build-Timestamp

  $summary = @{
    musics = @{
      $Title = @{
        $PlayStyle = @{
          $Difficulty = @{
            latest = @{
              timestamp = $timestamp
              score = $Score
              misscount = $Misscount
            }
          }
        }
      }
    }
  }
  $recent = @{
    list = @(
      @{
        timestamp = $timestamp
        difficulty = $Difficulty
        music = $Title
        score = $Score
        misscount = $Misscount
      }
    )
  }

  Ensure-Directory (Split-Path -Parent $summaryPath)
  Ensure-Directory (Split-Path -Parent $recentPath)
  Ensure-Directory $FixtureArchiveDir
  Write-Utf8NoBomFile -Path $summaryPath -Content (($summary | ConvertTo-Json -Depth 20) + "`n")
  Write-Utf8NoBomFile -Path $recentPath -Content (($recent | ConvertTo-Json -Depth 20) + "`n")
  Copy-IfExists -SourcePath $summaryPath -TargetPath (Join-Path $FixtureArchiveDir "summary.json")
  Copy-IfExists -SourcePath $recentPath -TargetPath (Join-Path $FixtureArchiveDir "recent.json")
}

function Write-NotebookUnresolvedAliasFixture(
  [string]$WatchDir,
  [string]$Title,
  [string]$PlayStyle,
  [string]$Difficulty,
  [int]$Score,
  [int]$Misscount,
  [string]$FixtureArchiveDir
) {
  $summaryPath = Join-Path $WatchDir "records\summary.json"
  $recentPath = Join-Path $WatchDir "export\recent.json"
  $timestamp = Build-Timestamp

  $summary = @{
    musics = @{
      $Title = @{
        $PlayStyle = @{
          $Difficulty = @{
            latest = @{
              timestamp = $timestamp
              score = $Score
              misscount = $Misscount
            }
          }
        }
      }
    }
  }
  $recent = @{
    list = @(
      @{
        timestamp = $timestamp
        difficulty = $Difficulty
        music = $Title
        score = $Score
        misscount = $Misscount
      }
    )
  }

  Ensure-Directory (Split-Path -Parent $summaryPath)
  Ensure-Directory (Split-Path -Parent $recentPath)
  Ensure-Directory $FixtureArchiveDir
  Write-Utf8NoBomFile -Path $summaryPath -Content (($summary | ConvertTo-Json -Depth 20) + "`n")
  Write-Utf8NoBomFile -Path $recentPath -Content (($recent | ConvertTo-Json -Depth 20) + "`n")
  Copy-IfExists -SourcePath $summaryPath -TargetPath (Join-Path $FixtureArchiveDir "summary.json")
  Copy-IfExists -SourcePath $recentPath -TargetPath (Join-Path $FixtureArchiveDir "recent.json")
}

function Write-DakenCounterV3Payload(
  [string]$ControlFilePath,
  [string]$Title,
  [string]$PlayStyle,
  [string]$Difficulty,
  [int]$ChartId = 0,
  [int]$Score,
  [int]$Misscount,
  [string]$FixtureArchiveDir
) {
  $diff = Build-DiffCode -PlayStyle $PlayStyle -Difficulty $Difficulty
  $item = @{
    battle = 0
    title = $Title
    difficulty = $diff
    score = $Score
    bp = $Misscount
    pre_score = [Math]::Max($Score - 60, 0)
    pre_bp = $Misscount + 8
    lamp = "EXH-CLEAR"
    pre_lamp = "H-CLEAR"
    opt = "RANDOM"
    playspeed = "2.50"
    notes = 2000
  }
  if ($ChartId -gt 0) {
    $item.chart_id = $ChartId
  }
  $payload = @{
    type = "today_updates"
    data = @{
      items = @($item)
    }
  }

  Ensure-Directory (Split-Path -Parent $ControlFilePath)
  Ensure-Directory $FixtureArchiveDir
  Write-Utf8NoBomFile -Path $ControlFilePath -Content (($payload | ConvertTo-Json -Depth 20) + "`n")
  Copy-IfExists -SourcePath $ControlFilePath -TargetPath (Join-Path $FixtureArchiveDir "today_updates.json")
}

function Collect-FailureArtifacts(
  [string]$FailureRoot,
  [hashtable]$PathMap
) {
  Ensure-Directory $FailureRoot
  foreach ($entry in $PathMap.GetEnumerator()) {
    Copy-IfExists -SourcePath $entry.Value -TargetPath (Join-Path $FailureRoot "$($entry.Key)")
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$startClientsScript = Join-Path $repoRoot "scripts\start-local-two-clients.ps1"
$mockScript = Join-Path $repoRoot "scripts\start-daken-counter-v3-mock.ps1"
$chartMasterPath = Join-Path $repoRoot "apps\worker\src\master\generated\iidx-song-master.json"

if (-not (Test-Path -LiteralPath $startClientsScript)) {
  throw "Missing script: $startClientsScript"
}
if (-not (Test-Path -LiteralPath $chartMasterPath)) {
  throw "Missing chart master: $chartMasterPath"
}

$timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$runtimeRootPath = if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) {
  Join-Path $repoRoot "testdata\runtime\e2e\$Scenario-$timestamp"
} elseif ([System.IO.Path]::IsPathRooted($RuntimeRoot)) {
  $RuntimeRoot
} else {
  Join-Path $repoRoot $RuntimeRoot
}
Ensure-Directory $runtimeRootPath
$runtimeRootPath = (Resolve-Path -LiteralPath $runtimeRootPath).Path
$artifactRoot = Join-Path $runtimeRootPath "artifacts"
$fixtureArchiveRoot = Join-Path $artifactRoot "fixtures"
Ensure-Directory $artifactRoot
Ensure-Directory $fixtureArchiveRoot

$mainLogRoot = Join-Path $runtimeRootPath "logs"
Ensure-Directory $mainLogRoot

if (-not $SkipWorker -and -not (Test-PortOpen 8787)) {
  Start-LoggedPowerShell `
    -Title "INFINITAS Worker Dev" `
    -WorkingDirectory $repoRoot `
    -Command "npm --workspace @infinitas/worker run dev" `
    -LogPath (Join-Path $mainLogRoot "worker.log")
  Wait-PortOpen -Port 8787 -Label "Worker Dev"
}

if (-not $SkipFrontend -and -not (Test-PortOpen 1420)) {
  Start-LoggedPowerShell `
    -Title "INFINITAS Client Dev Server" `
    -WorkingDirectory $repoRoot `
    -Command "npm --workspace @infinitas/client run dev" `
    -LogPath (Join-Path $mainLogRoot "client-dev.log")
  Wait-PortOpen -Port 1420 -Label "Client Dev Server"
}

$joinCode = "E2EABCD2"
$createRoomRequest = @{
  visibility = "PRIVATE"
  join_code = $joinCode
  mode = $Mode
  win_metric = "SCORE"
  play_style = "SP"
  level_filter = "ANY"
  room_comment = "local-e2e-$Scenario"
  max_players = 2
}
$roomResponse = Invoke-RestMethod `
  -Uri "http://127.0.0.1:8787/api/rooms" `
  -Method Post `
  -Body ($createRoomRequest | ConvertTo-Json -Depth 8) `
  -ContentType "application/json; charset=utf-8"

$roomId = [string]$roomResponse.room_id
$roomJoinCode = [string]$roomResponse.settings.join_code
if ([string]::IsNullOrWhiteSpace($roomId)) {
  throw "Failed to create room for E2E."
}
$expectedHistoryMode = Resolve-HistoryMode -RoomMode $Mode

$sourceA = if ($Scenario -eq "reflux-reflux-full") { "reflux" } else { "daken_counter_v3" }
$sourceB = if ($Scenario -eq "reflux-reflux-full") { "reflux" } else { "inf-notebook" }

& $startClientsScript `
  -ClientCount 2 `
  -RuntimeRoot $runtimeRootPath `
  -CargoTargetRoot $CargoTargetRoot `
  -E2E `
  -Scenario $Scenario `
  -E2EMatchCount $MatchCount `
  -RoomId $roomId `
  -JoinCode $roomJoinCode `
  -ClientASource $sourceA `
  -ClientBSource $sourceB `
  -SkipWorker `
  -SkipFrontend

$clientA = "client-a"
$clientB = "client-b"
$eventLogA = Join-Path $runtimeRootPath "logs\$clientA\$clientA.events.jsonl"
$eventLogB = Join-Path $runtimeRootPath "logs\$clientB\$clientB.events.jsonl"
$statePathA = Join-Path $runtimeRootPath "runtime\$clientA\$clientA.state.json"
$statePathB = Join-Path $runtimeRootPath "runtime\$clientB\$clientB.state.json"
$watchDirA = Join-Path $runtimeRootPath "watch\$clientA"
$watchDirB = Join-Path $runtimeRootPath "watch\$clientB"
$tauriLogA = Join-Path $runtimeRootPath "logs\$clientA\$clientA-tauri.log"
$tauriLogB = Join-Path $runtimeRootPath "logs\$clientB\$clientB-tauri.log"
$latestShotA = Join-Path $runtimeRootPath "runtime\$clientA\$clientA.latest.png"
$latestShotB = Join-Path $runtimeRootPath "runtime\$clientB\$clientB.latest.png"

$chartTitleIndex = @{}
$chartTitlesByStyleDifficulty = @{}
@(
  @'
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
seen = set()
for chart in payload.get("charts", []):
    key = f"{chart.get('play_style', '')}|{chart.get('difficulty', '')}|{chart.get('title_search_key', '')}"
    if key in seen:
        continue
    seen.add(key)
    print(f"{key}\t{str(chart.get('title', ''))}")
'@ | python - $chartMasterPath
) | ForEach-Object {
  $parts = $_ -split "`t", 2
  if ($parts.Length -lt 2) {
    return
  }

  $chartKey = $parts[0]
  $title = $parts[1]

  if (-not $chartTitleIndex.ContainsKey($chartKey)) {
    $chartTitleIndex[$chartKey] = $title
  }

  $keyParts = $chartKey -split "\|", 3
  if ($keyParts.Length -eq 3) {
    $styleDifficultyKey = "$($keyParts[0])|$($keyParts[1])"
    if (-not $chartTitlesByStyleDifficulty.ContainsKey($styleDifficultyKey)) {
      $chartTitlesByStyleDifficulty[$styleDifficultyKey] = @()
    }

    $existing = $chartTitlesByStyleDifficulty[$styleDifficultyKey]
    if (-not ($existing | Where-Object { $_.titleSearchKey -eq $keyParts[2] })) {
      $chartTitlesByStyleDifficulty[$styleDifficultyKey] += [pscustomobject]@{
        titleSearchKey = $keyParts[2]
        title = $title
      }
    }
  }
}

function Resolve-ChartTitle([object]$ExpectedKey) {
  $lookupKey = "$($ExpectedKey.play_style)|$($ExpectedKey.difficulty)|$($ExpectedKey.title_search_key)"
  if ($chartTitleIndex.ContainsKey($lookupKey)) {
    return $chartTitleIndex[$lookupKey]
  }
  return [string]$ExpectedKey.title_search_key
}

function Resolve-NotebookUnresolvedAliasTitle([object]$ExpectedKey, [string]$ExpectedTitle) {
  $styleDifficultyKey = "$($ExpectedKey.play_style)|$($ExpectedKey.difficulty)"
  if (-not $chartTitlesByStyleDifficulty.ContainsKey($styleDifficultyKey)) {
    throw "Failed to resolve unresolved_alias fixture title: no charts for $styleDifficultyKey."
  }

  $candidates = $chartTitlesByStyleDifficulty[$styleDifficultyKey]
  foreach ($candidate in $candidates) {
    if ([string]$candidate.titleSearchKey -eq [string]$ExpectedKey.title_search_key) {
      continue
    }
    if ([string]$candidate.title -eq $ExpectedTitle) {
      continue
    }
    return [string]$candidate.title
  }

  throw "Failed to resolve unresolved_alias fixture title: no alternate chart for $styleDifficultyKey."
}

$mockProcess = $null
$dakenControlPath = Join-Path $runtimeRootPath "runtime\$clientA\daken-control.json"
$dakenMockLog = Join-Path $runtimeRootPath "logs\$clientA\daken-mock.log"
if ($sourceA -eq "daken_counter_v3") {
  Write-Utf8NoBomFile -Path $dakenControlPath -Content ('{"type":"today_updates","data":{"items":[]}}' + "`n")
  $pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue)
  $shellExe = if ($pwsh) { $pwsh.Source } else { "powershell" }
  $mockProcess = Start-Process `
    -FilePath $shellExe `
    -ArgumentList "-ExecutionPolicy", "Bypass", "-File", $mockScript, "-Port", "18768", "-ControlFile", $dakenControlPath, "-LogPath", $dakenMockLog, "-SubProtocol", "infinitas-arena-daken-v3" `
    -PassThru
  Wait-PortOpen -Port 18768 -Label "daken_counter_v3 mock"
}

$normalizeLineA = 0
$normalizeLineB = 0
$resultLineA = 0
$resultLineB = 0
$unresolvedChecked = $false
$observedMatchIds = @()

try {
  Wait-E2EEvent -LogPath $eventLogA -EventName "room_join_succeeded" -WaitSeconds $TimeoutSeconds | Out-Null
  Wait-E2EEvent -LogPath $eventLogB -EventName "room_join_succeeded" -WaitSeconds $TimeoutSeconds | Out-Null

  $previousMatchId = $null
  for ($matchAttempt = 0; $matchAttempt -lt $MatchCount; $matchAttempt++) {
    $matchLabel = "match-$($matchAttempt + 1)"
    $playingState = Wait-StateDump `
      -StatePath $statePathA `
      -Description "client-a enters PLAYING ($matchLabel)" `
      -WaitSeconds $TimeoutSeconds `
      -Predicate {
        param($state)
        $snapshot = $state.state.roomSnapshot
        return $snapshot -and $snapshot.room_state -eq "PLAYING"
      }

    $playingSnapshot = $playingState.state.roomSnapshot
    $playingMatchId = [string]$playingSnapshot.current_match_id
    if ([string]::IsNullOrWhiteSpace($playingMatchId)) {
      $playingMatchId = [string]$playingSnapshot.room_id
    }
    if ($previousMatchId -and $playingMatchId -eq $previousMatchId) {
      throw "Rematch did not rotate current_match_id before PLAYING. match_id=$playingMatchId"
    }

    for ($roundAttempt = 0; $roundAttempt -lt 5; $roundAttempt++) {
      $stateA = Wait-StateDump `
        -StatePath $statePathA `
        -Description "client-a playing or result ($matchLabel)" `
        -WaitSeconds $TimeoutSeconds `
        -Predicate {
          param($state)
          $roomSnapshot = $state.state.roomSnapshot
          if (-not $roomSnapshot) {
            return $false
          }
          return @("PLAYING", "RESULT", "CLOSED") -contains $roomSnapshot.room_state
        }

      $roomSnapshot = $stateA.state.roomSnapshot
      if ($roomSnapshot.room_state -ne "PLAYING") {
        break
      }

      $currentRound = $roomSnapshot.current_round
      if (-not $currentRound) {
        Start-Sleep -Milliseconds 500
        continue
      }

      $roundIndex = [int]$currentRound.round_index
      $expected = $currentRound.expected_key
      $title = Resolve-ChartTitle -ExpectedKey $expected
      $scoreA = 2500 + ($roundIndex * 10)
      $scoreB = 2520 + ($roundIndex * 10)
      $missA = [Math]::Max(10 - $roundIndex, 0)
      $missB = [Math]::Max(12 - $roundIndex, 0)

      $roundArchiveA = Join-Path $fixtureArchiveRoot "$clientA\$matchLabel\round-$roundIndex"
      $roundArchiveB = Join-Path $fixtureArchiveRoot "$clientB\$matchLabel\round-$roundIndex"

      if ($Scenario -eq "reflux-reflux-full") {
        Write-RefluxFixture -WatchDir $watchDirA -Title $title -PlayStyle $expected.play_style -Difficulty $expected.difficulty -Score $scoreA -Misscount $missA -FixtureArchiveDir $roundArchiveA
        Write-RefluxFixture -WatchDir $watchDirB -Title $title -PlayStyle $expected.play_style -Difficulty $expected.difficulty -Score $scoreB -Misscount $missB -FixtureArchiveDir $roundArchiveB
      } else {
        $expectedChartId = 0
        try {
          $parsedChartId = [int]$expected.chart_id
          if ($parsedChartId -gt 0) {
            $expectedChartId = $parsedChartId
          }
        } catch {
          $expectedChartId = 0
        }
        Write-DakenCounterV3Payload -ControlFilePath $dakenControlPath -Title $title -PlayStyle $expected.play_style -Difficulty $expected.difficulty -ChartId $expectedChartId -Score $scoreA -Misscount $missA -FixtureArchiveDir $roundArchiveA
        if (-not $unresolvedChecked) {
          $unresolvedTitle = Resolve-NotebookUnresolvedAliasTitle -ExpectedKey $expected -ExpectedTitle $title
          $unresolvedArchive = Join-Path $fixtureArchiveRoot "$clientB\unresolved_alias"
          Write-NotebookUnresolvedAliasFixture `
            -WatchDir $watchDirB `
            -Title $unresolvedTitle `
            -PlayStyle $expected.play_style `
            -Difficulty $expected.difficulty `
            -Score ($scoreB + 10) `
            -Misscount ($missB + 10) `
            -FixtureArchiveDir $unresolvedArchive
          $unresolvedEvent = Wait-E2EEvent `
            -LogPath $eventLogB `
            -EventName "unresolved_alias_dialog_opened" `
            -AfterLine $normalizeLineB `
            -WaitSeconds $TimeoutSeconds
          $normalizeLineB = [Math]::Max($normalizeLineB, $unresolvedEvent.Line)
          $unresolvedChecked = $true
        }
        Write-NotebookFixture -WatchDir $watchDirB -Title $title -PlayStyle $expected.play_style -Difficulty $expected.difficulty -Score $scoreB -Misscount $missB -FixtureArchiveDir $roundArchiveB
      }

      $normalizedA = Wait-E2EEvent `
        -LogPath $eventLogA `
        -EventName "normalize_succeeded" `
        -AfterLine $normalizeLineA `
        -WaitSeconds $TimeoutSeconds
      $normalizeLineA = $normalizedA.Line

      $normalizedB = Wait-E2EEvent `
        -LogPath $eventLogB `
        -EventName "normalize_succeeded" `
        -AfterLine $normalizeLineB `
        -WaitSeconds $TimeoutSeconds
      $normalizeLineB = $normalizedB.Line

      Wait-StateDump `
        -StatePath $statePathA `
        -Description "round transition after $roundIndex ($matchLabel)" `
        -WaitSeconds $TimeoutSeconds `
        -Predicate {
          param($state)
          $snapshot = $state.state.roomSnapshot
          if (-not $snapshot) {
            return $false
          }
          if ($snapshot.room_state -ne "PLAYING") {
            return $true
          }
          if (-not $snapshot.current_round) {
            return $false
          }
          return [int]$snapshot.current_round.round_index -gt $roundIndex
        } | Out-Null
    }

    $resultEventA = Wait-E2EEvent `
      -LogPath $eventLogA `
      -EventName "result_received" `
      -AfterLine $resultLineA `
      -WaitSeconds $TimeoutSeconds
    $resultLineA = $resultEventA.Line

    $resultEventB = Wait-E2EEvent `
      -LogPath $eventLogB `
      -EventName "result_received" `
      -AfterLine $resultLineB `
      -WaitSeconds $TimeoutSeconds
    $resultLineB = $resultEventB.Line

    # RESULT may be intentionally brief when the E2E runner advances a rematch.
    # The RESULT_READY event plus the match id captured at PLAYING is the stable evidence.
    $resultMatchId = $playingMatchId

    Wait-StateDump `
      -StatePath $statePathA `
      -Description "client-a match history captures $expectedHistoryMode match ($matchLabel)" `
      -WaitSeconds $TimeoutSeconds `
      -Predicate {
        param($state)
        if (-not $state.state.matchHistory -or -not $state.state.activeMatchHistory) {
          return $false
        }
        $active = $state.state.activeMatchHistory
        if ($active.mode -ne $expectedHistoryMode) {
          return $false
        }
        $activeMatchIds = @($active.matches | ForEach-Object { [string]$_.match_id })
        if (-not ($activeMatchIds -contains $resultMatchId)) {
          return $false
        }
        $storedModes = @($state.state.matchHistory.matches | ForEach-Object { [string]$_.mode })
        return $storedModes -contains $expectedHistoryMode
      } | Out-Null

    $observedMatchIds += $resultMatchId
    $previousMatchId = $resultMatchId
  }

  $uniqueObservedMatchIds = @($observedMatchIds | Select-Object -Unique)
  if ($MatchCount -gt 1 -and $uniqueObservedMatchIds.Count -lt $MatchCount) {
    throw "Expected $MatchCount distinct match ids in rematch flow, but observed $($uniqueObservedMatchIds.Count): $($uniqueObservedMatchIds -join ', ')"
  }

  $summaryPath = Join-Path $artifactRoot "summary-$timestamp.md"
  $summaryLines = @(
    "# local-e2e result"
    ""
    "- scenario: $Scenario"
    "- mode: $Mode"
    "- history_mode: $expectedHistoryMode"
    "- match_count: $MatchCount"
    "- observed_match_ids: $($observedMatchIds -join ', ')"
    "- room_id: $roomId"
    "- join_code: $roomJoinCode"
    "- runtime_root: $runtimeRootPath"
    "- result: PASS"
  )
  if ($Scenario -eq "mixed-daken-v3-notebook") {
    $summaryLines += "- unresolved_alias_check: PASS"
  }
  Write-Utf8NoBomFile -Path $summaryPath -Content (($summaryLines -join "`n") + "`n")
  Write-Host "E2E passed: $Scenario" -ForegroundColor Green
  Write-Host "Artifacts: $artifactRoot"
} catch {
  $failureTimestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
  $failureRoot = Join-Path $artifactRoot "failure-$failureTimestamp"
  $failureFiles = @{
    "client-a.events.jsonl" = $eventLogA
    "client-b.events.jsonl" = $eventLogB
    "client-a.tauri.log" = $tauriLogA
    "client-b.tauri.log" = $tauriLogB
    "client-a.state.json" = $statePathA
    "client-b.state.json" = $statePathB
    "client-a.latest.png" = $latestShotA
    "client-b.latest.png" = $latestShotB
    "daken-control.json" = $dakenControlPath
    "daken-mock.log" = $dakenMockLog
  }
  Collect-FailureArtifacts -FailureRoot $failureRoot -PathMap $failureFiles
  throw
} finally {
  if ($mockProcess -and -not $mockProcess.HasExited) {
    try {
      Stop-Process -Id $mockProcess.Id -Force -ErrorAction SilentlyContinue
    } catch {
      # ignore
    }
  }
  $launcherRegistry = Join-Path $runtimeRootPath "client-launchers.json"
  if (Test-Path -LiteralPath $launcherRegistry) {
    try {
      $launcherIds = @(((Read-Utf8Text $launcherRegistry) | ConvertFrom-Json).process_ids)
      foreach ($launcherId in $launcherIds) {
        Stop-ProcessTree -ProcessId ([int]$launcherId)
      }
    } catch {
      Write-Warning "Failed to stop one or more E2E client process trees: $($_.Exception.Message)"
    }
  }
}
