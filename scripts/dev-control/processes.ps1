param([ValidateSet('List','Listeners','Stop')][string]$Action = 'List')
$ErrorActionPreference = 'Stop'
if ($Action -eq 'Listeners') {
  $items = @(Get-NetTCPConnection -State Listen | Select-Object @{n='port';e={[int]$_.LocalPort}}, @{n='address';e={$_.LocalAddress}}, @{n='pid';e={[int]$_.OwningProcess}})
  ConvertTo-Json -InputObject $items -Compress
  exit
}
if ($Action -eq 'List') {
  $items = @(Get-CimInstance Win32_Process | Select-Object @{n='pid';e={[int]$_.ProcessId}}, @{n='parentPid';e={[int]$_.ParentProcessId}}, @{n='createdAt';e={$_.CreationDate.ToUniversalTime().ToString('o')}}, @{n='executablePath';e={$_.ExecutablePath}})
  ConvertTo-Json -InputObject $items -Compress
  exit
}
$expected = [Console]::In.ReadToEnd() | ConvertFrom-Json
$results = @()
foreach ($item in $expected) {
  try {
    $process = [System.Diagnostics.Process]::GetProcessById([int]$item.pid)
    $heldHandle = $process.Handle
    $actualPath = $process.MainModule.FileName
    $actualTime = $process.StartTime.ToUniversalTime()
    if ($actualPath -ne $item.executablePath -or [Math]::Abs(($actualTime - [DateTime]::Parse($item.createdAt).ToUniversalTime()).TotalMilliseconds) -gt 1) {
      $results += @{ pid=$item.pid; status='identity-mismatch' }
      continue
    }
    $process.Kill()
    if ($process.WaitForExit(5000)) {
      $results += @{ pid=$item.pid; status='stopped' }
    } else {
      $results += @{ pid=$item.pid; status='failed'; error='Process exit was not confirmed within 5 seconds.' }
    }
  } catch [System.ArgumentException] {
    $results += @{ pid=$item.pid; status='already-exited' }
  } catch {
    $results += @{ pid=$item.pid; status='failed'; error=$_.Exception.Message }
  } finally {
    if ($null -ne $process) { $process.Dispose(); $process = $null }
  }
}
ConvertTo-Json -InputObject $results -Compress
