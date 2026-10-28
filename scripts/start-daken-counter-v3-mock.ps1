param(
  [Parameter(Mandatory = $true)]
  [int]$Port,
  [Parameter(Mandatory = $true)]
  [string]$ControlFile,
  [Parameter(Mandatory = $true)]
  [string]$LogPath,
  [string]$SubProtocol = "infinitas-arena-daken-v3"
)

$ErrorActionPreference = "Stop"

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Write-Utf8NoBomFile([string]$Path, [string]$Content, [switch]$Append) {
  $directory = Split-Path -Parent $Path
  if ($directory) {
    Ensure-Directory $directory
  }

  $encoding = [System.Text.UTF8Encoding]::new($false)
  $normalized = $Content -replace "`r?`n", "`n"
  if ($Append) {
    [System.IO.File]::AppendAllText($Path, $normalized, $encoding)
    return
  }
  [System.IO.File]::WriteAllText($Path, $normalized, $encoding)
}

function Read-Utf8Text([string]$Path) {
  $encoding = [System.Text.UTF8Encoding]::new($false, $true)
  return [System.IO.File]::ReadAllText($Path, $encoding)
}

function Write-Log([string]$Message) {
  $timestamp = [DateTimeOffset]::Now.ToString("o")
  Write-Utf8NoBomFile -Path $LogPath -Content "$timestamp $Message`n" -Append
}

function Send-WebSocketText([System.Net.WebSockets.WebSocket]$Socket, [string]$Message) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Message)
  $segment = [ArraySegment[byte]]::new($bytes)
  $Socket.SendAsync(
    $segment,
    [System.Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [Threading.CancellationToken]::None
  ).GetAwaiter().GetResult()
}

function Accept-WebSocketContext(
  [System.Net.HttpListenerContext]$Context,
  [string]$PreferredSubProtocol
) {
  # HTTP.sys owns the socket (PID 4); a child-only nonce attests this launcher.
  $readyToken = $env:INF_ARENA_DEV_CONTROL_SOURCE_NONCE
  if ($readyToken -and $Context.Request.Url.AbsolutePath -eq '/__dev_control_ready' -and $Context.Request.Headers['X-Dev-Control-Source'] -eq $readyToken) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes((@{ pid=$PID; port=$Port; token=$readyToken } | ConvertTo-Json -Compress))
    $Context.Response.ContentType = 'application/json'
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.Close()
    return $null
  }
  if (-not $Context.Request.IsWebSocketRequest) {
    $Context.Response.StatusCode = 400
    $Context.Response.Close()
    Write-Log "received non-websocket request."
    return $null
  }

  try {
    $requestedHeader = $Context.Request.Headers["Sec-WebSocket-Protocol"]
    $requestedProtocols = @()
    if (-not [string]::IsNullOrWhiteSpace($requestedHeader)) {
      $requestedProtocols = $requestedHeader.Split(",") |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    }

    if ($requestedProtocols.Count -gt 0) {
      $selectedProtocol = if ($requestedProtocols -contains $PreferredSubProtocol) {
        $PreferredSubProtocol
      } else {
        $requestedProtocols[0]
      }
      return $Context.AcceptWebSocketAsync($selectedProtocol).GetAwaiter().GetResult()
    }

    $method = $Context.GetType().GetMethod(
      "AcceptWebSocketAsync",
      [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::Instance,
      $null,
      [Type[]]@([string]),
      $null
    )
    if ($null -eq $method) {
      throw "AcceptWebSocketAsync(System.String) method was not found."
    }
    $task = $method.Invoke($Context, @([object]$null))
    return $task.GetAwaiter().GetResult()
  } catch {
    Write-Log "websocket accept error: $($_.Exception.Message)"
    try {
      if ($Context.Response -and $Context.Response.OutputStream -and $Context.Response.OutputStream.CanWrite) {
        $Context.Response.StatusCode = 500
        $Context.Response.Close()
      }
    } catch {
      # ignore
    }
    return $null
  }
}

$controlFilePath = if ([System.IO.Path]::IsPathRooted($ControlFile)) {
  $ControlFile
} else {
  Join-Path (Get-Location).Path $ControlFile
}
$logPath = if ([System.IO.Path]::IsPathRooted($LogPath)) {
  $LogPath
} else {
  Join-Path (Get-Location).Path $LogPath
}

Ensure-Directory (Split-Path -Parent $controlFilePath)
Write-Utf8NoBomFile -Path $logPath -Content ""

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Log "daken-counter-v3 mock started. port=$Port control=$controlFilePath subprotocol=$SubProtocol"

$sockets = [System.Collections.Generic.List[System.Net.WebSockets.WebSocket]]::new()
$latestBroadcastPayload = $null
$acceptTask = $listener.GetContextAsync()

while ($true) {
  try {
    if ($acceptTask.Wait(50)) {
      $context = $acceptTask.GetAwaiter().GetResult()
      $acceptTask = $listener.GetContextAsync()
      $wsContext = Accept-WebSocketContext -Context $context -PreferredSubProtocol $SubProtocol
      if ($wsContext -ne $null) {
        $socket = $wsContext.WebSocket
        $sockets.Add($socket)
        Write-Log "client connected. active=$($sockets.Count)"
        if (-not [string]::IsNullOrWhiteSpace($latestBroadcastPayload) -and $socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
          Send-WebSocketText -Socket $socket -Message $latestBroadcastPayload
          Write-Log "latest payload replayed to new client."
        }
      }
    }
  } catch {
    Write-Log "accept loop error: $($_.Exception.Message)"
    $acceptTask = $listener.GetContextAsync()
  }

  for ($index = $sockets.Count - 1; $index -ge 0; $index -= 1) {
    $socket = $sockets[$index]
    if ($socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
      $sockets.RemoveAt($index)
    }
  }

  if (Test-Path -LiteralPath $controlFilePath) {
    $payload = Read-Utf8Text $controlFilePath
    if (-not [string]::IsNullOrWhiteSpace($payload) -and $payload -ne $latestBroadcastPayload) {
      $latestBroadcastPayload = $payload
      $sent = 0
      for ($index = $sockets.Count - 1; $index -ge 0; $index -= 1) {
        $socket = $sockets[$index]
        if ($socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
          $sockets.RemoveAt($index)
          continue
        }
        try {
          Send-WebSocketText -Socket $socket -Message $payload
          $sent += 1
        } catch {
          Write-Log "payload send error: $($_.Exception.Message)"
          $sockets.RemoveAt($index)
        }
      }
      Write-Log "payload sent. recipients=$sent"
    }
  }

  Start-Sleep -Milliseconds 200
}
