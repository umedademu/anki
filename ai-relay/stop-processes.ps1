# 暗記アプリ「AIに質問」の中継役・トンネル（とその cloudflared）を止める。gonta のプロセスには触れない。
function Stop-AnkiAIProcesses([switch]$IncludeLauncher) {
    $stopped = @()
    $targets = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'ai-relay[\\/]main\.mjs' })
    # この中継役のトンネルは 127.0.0.1:18920 へつなぐ cloudflared（gonta は 18890）。
    $targets += @(Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -match '127\.0\.0\.1:18920' })
    if ($IncludeLauncher) {
        $targets += @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'Start-AnkiAI\.ps1' })
    }
    foreach ($process in $targets) {
        try { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop; $stopped += $process.ProcessId } catch {}
    }
    return $stopped
}
