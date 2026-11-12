# 自動起動のタスク AnkiAI-Autostart を外し、動いている中継役・トンネルを止める。
# 設定（%USERPROFILE%\.anki-ai）とログ（%LOCALAPPDATA%\AnkiAI）は消さない。gonta には触れない。
$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName 'AnkiAI-Autostart' -ErrorAction SilentlyContinue
if ($task) {
    Stop-ScheduledTask -TaskName 'AnkiAI-Autostart' -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName 'AnkiAI-Autostart' -Confirm:$false
    Write-Host '自動起動のタスク AnkiAI-Autostart を外しました。'
} else {
    Write-Host '自動起動のタスク AnkiAI-Autostart は登録されていません。'
}
. (Join-Path $PSScriptRoot 'stop-processes.ps1')
Stop-AnkiAIProcesses -IncludeLauncher
Write-Host '中継役とトンネルを止めました。手動で使うときは ai-relay\start.cmd を実行してください。' -ForegroundColor Green
