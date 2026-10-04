param(
  [ValidateRange(2, 4)]
  [int]$ClientCount = 2,
  [switch]$SkipWorker,
  [switch]$SkipFrontend,
  [string]$RuntimeRoot = "testdata/runtime",
  [string]$CargoTargetRoot = "",
  [switch]$E2E,
  [string]$Scenario = "manual",
  [ValidateRange(1, 5)]
  [int]$E2EMatchCount = 1,
  [string]$RoomId = "",
  [string]$JoinCode = "",
  [string]$ApiBaseUrl = "http://127.0.0.1:8787",
  [ValidateSet("NORMAL", "HOST_EVENT")]
  [string]$RoomKind = "NORMAL",
  [ValidateRange(1, 10)]
  [int]$EventRoundCount = 2,
  [switch]$EventDisconnectHost,
  [ValidateSet("inf-notebook", "reflux", "daken_counter_v3", "inf_daken_counter")]
  [string]$ClientASource = "inf-notebook",
  [ValidateSet("inf-notebook", "reflux", "daken_counter_v3", "inf_daken_counter")]
  [string]$ClientBSource = "inf-notebook"
)

$ErrorActionPreference = "Stop"

if ($E2E -and $ClientCount -ne 2) {
  throw "E2E mode currently requires -ClientCount 2."
}

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

function Wait-PortOpen([int]$Port, [string]$Label, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen $Port) {
      return
    }

    Start-Sleep -Milliseconds 500
  }

  throw "$Label did not open port $Port within $TimeoutSeconds seconds."
}

function Start-LoggedPowerShell(
  [string]$Title,
  [string]$WorkingDirectory,
  [string]$Command,
  [string]$LogPath,
  [hashtable]$EnvVars = @{}
) {
  $titleLiteral = $Title.Replace("'", "''")
  $workingLiteral = $WorkingDirectory.Replace("'", "''")
  $logLiteral = $LogPath.Replace("'", "''")
  $commandLiteral = $Command.Replace("'", "''")
  $launcherPath = [System.IO.Path]::ChangeExtension($LogPath, ".launcher.ps1")

  $envLines = @(
    foreach ($entry in $EnvVars.GetEnumerator() | Sort-Object Key) {
      $valueLiteral = [string]$entry.Value
      $valueLiteral = $valueLiteral.Replace("'", "''")
      "`$env:$($entry.Key) = '$valueLiteral'"
    }
  )

  $debugEnvCleanupLines = @(
    "Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue"
    "Remove-Item Env:VSCODE_INSPECTOR_OPTIONS -ErrorAction SilentlyContinue"
  )

  $scriptLines = @(
    "`$ErrorActionPreference = 'Stop'"
    "`$Host.UI.RawUI.WindowTitle = '$titleLiteral'"
    "Set-Location '$workingLiteral'"
    $debugEnvCleanupLines
    $envLines
    "& { $commandLiteral } 2>&1 | Tee-Object -FilePath '$logLiteral'"
  )

  if (-not (Test-Path -LiteralPath $LogPath)) {
    Write-Utf8NoBomFile $LogPath ""
  }

  Write-Utf8NoBomFile $launcherPath (($scriptLines -join "`n") + "`n")
  $pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
  $shellExe = if ($pwshCommand) { $pwshCommand.Source } else { "powershell" }
  return Start-Process -FilePath $shellExe -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", $launcherPath -PassThru
}

function Get-ClientId([int]$Index, [bool]$E2EMode) {
  if (-not $E2EMode) {
    return "p$Index"
  }

  switch ($Index) {
    1 { return "client-a" }
    2 { return "client-b" }
    3 { return "client-c" }
    4 { return "client-d" }
    default { return "client-$Index" }
  }
}

function Get-ClientRole([int]$Index, [bool]$E2EMode) {
  if (-not $E2EMode) {
    return ""
  }

  if ($Index -eq 1) {
    return "host"
  }

  return "guest"
}

function Get-ClientSource([int]$Index, [bool]$E2EMode) {
  if (-not $E2EMode) {
    return "inf-notebook"
  }

  if ($Index -eq 1) {
    return $ClientASource
  }
  if ($Index -eq 2) {
    return $ClientBSource
  }

  return "inf-notebook"
}

function New-ClientSpec([int]$Index, [string]$RuntimeRootPath, [string]$ConfigRootPath, [string]$CargoTargetRootPath) {
  $id = Get-ClientId -Index $Index -E2EMode ([bool]$E2E)
  $role = Get-ClientRole -Index $Index -E2EMode ([bool]$E2E)
  $source = Get-ClientSource -Index $Index -E2EMode ([bool]$E2E)
  $label = if ($E2E) { "E2E $id" } else { "Local P$Index" }
  $displayName = if ($E2E) { "E2E$Index" } else { "Local$Index" }
  $playerId = if ($E2E) { "e2e-$id" } else { "local-p$Index" }

  $watchRoot = Join-Path $RuntimeRootPath "watch\$id"
  $runtimeDir = Join-Path $RuntimeRootPath "runtime\$id"
  $logDir = Join-Path $RuntimeRootPath "logs\$id"
  $instanceRoot = Join-Path $RuntimeRootPath "instances\$id"
  $dakenDir = if ($E2E) { $watchRoot } else { Join-Path $instanceRoot "inf_daken_counter" }
  $notebookExportDir = if ($E2E) { Join-Path $watchRoot "export" } else { Join-Path $instanceRoot "inf-notebook\export" }
  $notebookRecordsDir = if ($E2E) { Join-Path $watchRoot "records" } else { Join-Path $instanceRoot "inf-notebook\records" }
  $refluxDir = if ($E2E) { $watchRoot } else { Join-Path $instanceRoot "reflux" }

  foreach ($path in @($watchRoot, $runtimeDir, $logDir, $dakenDir, $notebookExportDir, $notebookRecordsDir, $refluxDir)) {
    Ensure-Directory $path
  }

  $dakenPort = 18767 + $Index

  [pscustomobject]@{
    Id = $id
    Role = $role
    Source = $source
    Label = $label
    DisplayName = $displayName
    PlayerId = $playerId
    WindowTitle = "INFINITAS ARENA Client ($label)"
    WatchRoot = $watchRoot
    RuntimeDir = $runtimeDir
    LogDir = $logDir
    DakenFile = Join-Path $dakenDir "today_update.xml"
    NotebookExportFile = Join-Path $notebookExportDir "recent.json"
    NotebookRecordsFile = Join-Path $notebookRecordsDir "summary.json"
    RefluxLatestFile = Join-Path $refluxDir "latest.json"
    RefluxTrackerFile = Join-Path $refluxDir "tracker.tsv"
    DakenCounterV3Port = $dakenPort
    CargoTargetDir = if ([string]::IsNullOrWhiteSpace($CargoTargetRootPath)) {
      Join-Path $RuntimeRootPath "cargo-target\$id"
    } else {
      Join-Path $CargoTargetRootPath $id
    }
    ConfigPath = Join-Path $ConfigRootPath "$id.tauri.dev.json"
    LogPath = Join-Path $logDir "$id-tauri.log"
  }
}

function Initialize-ClientFixture([pscustomobject]$Spec) {
  if ($Spec.Source -eq "inf-notebook") {
    Write-Utf8NoBomFile -Path $Spec.NotebookExportFile -Content ('{"list":[]}' + "`n")
    Write-Utf8NoBomFile -Path $Spec.NotebookRecordsFile -Content ('{"musics":{}}' + "`n")
    return
  }

  if ($Spec.Source -eq "reflux") {
    Write-Utf8NoBomFile -Path $Spec.RefluxTrackerFile -Content "title`tSPL Lamp`tSPL EX Score`tSPL Miss Count`n"
    Write-Utf8NoBomFile -Path $Spec.RefluxLatestFile -Content ('{"timestamp":"19700101-000000","title":"-","title2":"-","diff":"SPL","exscore":"0","bad":"0","poor":"0","assist":"OFF","lamp":"NO PLAY","playtype":"SP"}' + "`n")
    return
  }

  if ($Spec.Source -eq "inf_daken_counter") {
    Write-Utf8NoBomFile -Path $Spec.DakenFile -Content "<today_update><Results></Results></today_update>`n"
  }
}

function Build-QueryString([pscustomobject]$Spec) {
  $queryParams = [ordered]@{
    instance = $Spec.Id
    label = $Spec.Label
    name = $Spec.DisplayName
    playerId = $Spec.PlayerId
    api = $ApiBaseUrl
    source = $Spec.Source
    dakenPath = $Spec.DakenFile
    notebookPath = $Spec.NotebookExportFile
    recordsPath = $Spec.NotebookRecordsFile
    refluxLatestPath = $Spec.RefluxLatestFile
    refluxTrackerPath = $Spec.RefluxTrackerFile
  }

  if ($Spec.Source -eq "daken_counter_v3") {
    $queryParams["dakenCounterV3Port"] = $Spec.DakenCounterV3Port
  }

  if ($E2E) {
    $queryParams["INF_ARENA_E2E"] = "1"
    $queryParams["INF_ARENA_PROFILE"] = $Spec.Id
    $queryParams["INF_ARENA_ROLE"] = $Spec.Role
    $queryParams["INF_ARENA_DATASOURCE"] = $Spec.Source
    $queryParams["INF_ARENA_E2E_MATCH_COUNT"] = [string]$E2EMatchCount
    $queryParams["INF_ARENA_WATCH_DIR"] = $Spec.WatchRoot
    $queryParams["INF_ARENA_RUNTIME_DIR"] = $Spec.RuntimeDir
    $queryParams["INF_ARENA_LOG_DIR"] = $Spec.LogDir
    $queryParams["INF_ARENA_E2E_SCENARIO"] = $Scenario
    $queryParams["INF_ARENA_E2E_ROOM_KIND"] = $RoomKind
    $queryParams["e2eEventRoundCount"] = [string]$EventRoundCount
    if ($EventDisconnectHost) {
      $queryParams["e2eEventDisconnectHost"] = "1"
    }
    if (-not [string]::IsNullOrWhiteSpace($RoomId)) {
      $queryParams["INF_ARENA_ROOM_ID"] = $RoomId.Trim()
    }
    if (-not [string]::IsNullOrWhiteSpace($JoinCode)) {
      $queryParams["INF_ARENA_JOIN_CODE"] = $JoinCode.Trim()
    }
  }

  $encoded = foreach ($entry in $queryParams.GetEnumerator()) {
    $key = [System.Uri]::EscapeDataString([string]$entry.Key)
    $value = [System.Uri]::EscapeDataString([string]$entry.Value)
    "$key=$value"
  }

  return "?" + ($encoded -join "&")
}

function Write-TauriDevConfig([pscustomobject]$Spec) {
  $identifierSuffix = ([string]$Spec.Id).ToLowerInvariant()
  $identifierSuffix = ($identifierSuffix -replace "[^a-z0-9\-]", "-").Trim("-")
  if ([string]::IsNullOrWhiteSpace($identifierSuffix)) {
    $identifierSuffix = "client"
  }

  $config = [ordered]@{
    identifier = "com.infinitas.arena.client.local.$identifierSuffix"
    build = [ordered]@{
      beforeDevCommand = "cmd /c exit 0"
      devUrl = "http://localhost:1420$(Build-QueryString $Spec)"
    }
    app = [ordered]@{
      windows = @(
        [ordered]@{
          label = "main"
          title = $Spec.WindowTitle
          width = 1280
          height = 900
          minWidth = 1024
          minHeight = 720
          resizable = $true
        }
      )
    }
  }

  Write-Utf8NoBomFile $Spec.ConfigPath (($config | ConvertTo-Json -Depth 8) + "`n")
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$clientRoot = Join-Path $repoRoot "apps\client"
$runtimeRootPath = if ([System.IO.Path]::IsPathRooted($RuntimeRoot)) {
  $RuntimeRoot
} else {
  Join-Path $repoRoot $RuntimeRoot
}
Ensure-Directory $runtimeRootPath
$runtimeRootPath = (Resolve-Path -LiteralPath $runtimeRootPath).Path
$cargoTargetRootPath = if ([string]::IsNullOrWhiteSpace($CargoTargetRoot)) {
  ""
} elseif ([System.IO.Path]::IsPathRooted($CargoTargetRoot)) {
  $CargoTargetRoot
} else {
  Join-Path $repoRoot $CargoTargetRoot
}
$logRoot = Join-Path $runtimeRootPath "logs"
$configRoot = Join-Path $runtimeRootPath "tauri-config"

Ensure-Directory $logRoot
Ensure-Directory $configRoot

$workerLog = Join-Path $logRoot "worker.log"
$frontendLog = Join-Path $logRoot "client-dev.log"
$clients = @(1..$ClientCount | ForEach-Object { New-ClientSpec -Index $_ -RuntimeRootPath $runtimeRootPath -ConfigRootPath $configRoot -CargoTargetRootPath $cargoTargetRootPath })

foreach ($client in $clients) {
  Ensure-Directory $client.CargoTargetDir
  Ensure-Directory $client.LogDir
  Initialize-ClientFixture -Spec $client
  Write-TauriDevConfig $client
}

if (-not $SkipWorker -and -not (Test-PortOpen 8787)) {
  $null = Start-LoggedPowerShell `
    -Title "INFINITAS Worker Dev" `
    -WorkingDirectory $repoRoot `
    -Command "npm --workspace @infinitas/worker run dev" `
    -LogPath $workerLog
  Wait-PortOpen -Port 8787 -Label "Worker Dev"
}

if (-not $SkipFrontend -and -not (Test-PortOpen 1420)) {
  $null = Start-LoggedPowerShell `
    -Title "INFINITAS Client Dev Server" `
    -WorkingDirectory $repoRoot `
    -Command "npm --workspace @infinitas/client run dev" `
    -LogPath $frontendLog
  Wait-PortOpen -Port 1420 -Label "Client Dev Server"
}

$clientLauncherIds = @()
foreach ($client in $clients) {
  $envVars = @{
    INFINITAS_INSTANCE_ID = $client.Id
    CARGO_TARGET_DIR = $client.CargoTargetDir
    INF_ARENA_DISABLE_DEEP_LINK_REGISTER = "1"
  }
  if ($E2E) {
    $envVars["INF_ARENA_E2E"] = "1"
  }

  $launcher = Start-LoggedPowerShell `
    -Title $client.WindowTitle `
    -WorkingDirectory $clientRoot `
    -Command "npm exec -- tauri dev --config `"$($client.ConfigPath)`" --no-dev-server-wait" `
    -LogPath $client.LogPath `
    -EnvVars $envVars
  $clientLauncherIds += $launcher.Id
}

Write-Utf8NoBomFile `
  -Path (Join-Path $runtimeRootPath "client-launchers.json") `
  -Content ((@{ process_ids = $clientLauncherIds } | ConvertTo-Json -Depth 3) + "`n")

Write-Host "Started $ClientCount local client instance(s)." -ForegroundColor Green
Write-Host "Runtime root: $runtimeRootPath"
Write-Host ""
Write-Host "Client summary:" -ForegroundColor Cyan
foreach ($client in $clients) {
  Write-Host "- id=$($client.Id) source=$($client.Source) role=$($client.Role) watch=$($client.WatchRoot) runtime=$($client.RuntimeDir) log=$($client.LogDir)"
}
