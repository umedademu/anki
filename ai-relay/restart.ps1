# 暗記アプリ「AIに質問」の中継役とトンネルを起動し直す（新しいプログラムや設定を読み込ませる）。
# 自動起動のタスク AnkiAI-Autostart が登録されていれば、動いているものを止めると約10秒後にタスクが起動し直す。
# 登録されていなければ、手動起動（start.cmd）を案内する。
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'stop-processes.ps1')
Write-Host ''
Write-Host '=== 「AIに質問」の中継役の起動し直し ===' -ForegroundColor Cyan
$task = Get-ScheduledTask -TaskName 'AnkiAI-Autostart' -ErrorAction SilentlyContinue
$stopped = Stop-AnkiAIProcesses
if ($stopped.Count) { Write-Host ('動いていた中継役・トンネルを止めました（番号 {0}）。' -f ($stopped -join ', ')) }
if (-not $task) {
    Write-Host '自動起動のタスク AnkiAI-Autostart は登録されていません。ai-relay\start.cmd で起動するか、ai-relay\install-autostart.cmd で登録してください。' -ForegroundColor Yellow
    exit 1
}
if ($task.State -ne 'Running') { Start-ScheduledTask -TaskName 'AnkiAI-Autostart'; Write-Host '自動起動のタスクを始めました。' }

Write-Host '起動を待っています（1分ほどかかることがあります）…'
$urlFile = Join-Path $env:USERPROFILE '.anki-ai\tunnel-url.txt'
$since = Get-Date
$relayOk = $false; $tunnelOk = $false
for ($i = 0; $i -lt 40 -and -not ($relayOk -and $tunnelOk); $i++) {
    Start-Sleep -Seconds 3
    if (-not $relayOk) {
        try { $relayOk = (Invoke-RestMethod -Uri 'http://127.0.0.1:18920/health' -TimeoutSec 3).ok -eq $true } catch {}
    }
    if (-not $tunnelOk -and (Test-Path -LiteralPath $urlFile)) { $tunnelOk = (Get-Item -LiteralPath $urlFile).LastWriteTime -gt $since }
}
$logs = Join-Path $env:LOCALAPPDATA 'AnkiAI'
if ($relayOk -and $tunnelOk) {
    Write-Host ('起動しました。接続先：{0}' -f (Get-Content -LiteralPath $urlFile -Raw).Trim()) -ForegroundColor Green
    Write-Host 'スマートフォンのアプリで「AIに質問」から聞いて、返事が来るか確かめてください。'
} else {
    if (-not $relayOk) { Write-Host ('中継役の起動を確かめられませんでした。{0}\relay.err.log を見てください。' -f $logs) -ForegroundColor Red }
    if (-not $tunnelOk) { Write-Host ('トンネルの起動を確かめられませんでした。{0}\tunnel.err.log を見てください。' -f $logs) -ForegroundColor Red }
    exit 1
}
