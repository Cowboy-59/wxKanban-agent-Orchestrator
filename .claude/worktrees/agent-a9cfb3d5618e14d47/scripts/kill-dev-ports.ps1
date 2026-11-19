$pids = Get-NetTCPConnection -LocalPort 3001,5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $pids) {
  try { Stop-Process -Id $p -Force -ErrorAction Stop; Write-Host "killed $p" } catch { }
}
Start-Sleep -Milliseconds 800
Write-Host done
