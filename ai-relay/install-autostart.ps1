param([switch]$NoStart)

# Windowsへのログイン時に、暗記アプリ「AIに質問」の中継役と専用のトンネルを画面なしで起動するタスクを登録する。
#   タスク名: AnkiAI-Autostart（このWindowsユーザーのログオン時。gonta の Gonta-Autostart とは別）
#   実行内容: %LOCALAPPDATA%\AnkiAI\Start-AnkiAI.ps1（autostart.ps1 の写し）が、中継役とトンネルを見張って動かし続ける。
# gonta の install-windows-startup.ps1 と同じ作り。外すときは uninstall-autostart.cmd。
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if ($repo -match '\\\.claude\\worktrees\\') { throw 'worktree からは登録できません。C:\Users\USER\Desktop\anki の ai-relay から実行してください。' }
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'AnkiAI'
$launcherPath = Join-Path $runtimeDirectory 'Start-AnkiAI.ps1'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'autostart.ps1') -Destination $launcherPath -Force

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Repo "{1}"' -f $launcherPath, $repo
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory $runtimeDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Start the anki AI relay and its Cloudflare tunnel at Windows sign-in without a window.'
Register-ScheduledTask -TaskName 'AnkiAI-Autostart' -InputObject $task -Force | Out-Null

if (-not $NoStart) { Start-ScheduledTask -TaskName 'AnkiAI-Autostart' }
Write-Host ('自動起動のタスク AnkiAI-Autostart を登録しました。ログは {0} にあります。' -f $runtimeDirectory) -ForegroundColor Green
