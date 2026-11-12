param(
    [Parameter(Mandatory = $true)][string]$Repo
)

# 暗記アプリ「AIに質問」の中継役（ai-relay\main.mjs relay）と専用のトンネル（ai-relay\main.mjs tunnel）を、
# 画面を出さずに動かし続ける見張り役。Windowsへのログイン時にタスク AnkiAI-Autostart が起動する。
# gonta の start-gonta.ps1 と同じ作り：落ちたら10秒後（起動して30秒以内に落ちた時は60秒後）に起動し直す。
# 起動ファイル・作業フォルダ・ログは %USERPROFILE%\.anki-ai\runtime に置く。%LOCALAPPDATA% は、Claude デスクトップ
# （MSIXでパッケージ化されたアプリ）から作ると別の場所に振り替えられ、タスク スケジューラから見えないため使わない。
$ErrorActionPreference = 'Stop'
$runtimeDirectory = Join-Path $env:USERPROFILE '.anki-ai\runtime'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$logPath = Join-Path $runtimeDirectory 'startup.log'

function Write-StartupLog([string]$Message) {
    Add-Content -LiteralPath $logPath -Value ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message) -Encoding UTF8
}
function Rotate-Log([string]$Path) {
    if ((Test-Path -LiteralPath $Path) -and (Get-Item -LiteralPath $Path).Length -gt 2097152) {
        Move-Item -LiteralPath $Path -Destination ($Path + '.previous') -Force
    }
}
function Resolve-Node {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in @((Join-Path $env:ProgramFiles 'nodejs\node.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw 'node.exe was not found.'
}
function Start-Worker([string]$Name) {
    Rotate-Log $logPath
    $out = Join-Path $runtimeDirectory ($Name + '.log')
    $err = Join-Path $runtimeDirectory ($Name + '.err.log')
    Rotate-Log $out; Rotate-Log $err
    $process = Start-Process -FilePath $script:node -ArgumentList @('ai-relay\main.mjs', $Name) -WorkingDirectory $Repo -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    Write-StartupLog ('Started {0} (pid {1}).' -f $Name, $process.Id)
    return $process
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\AnkiAI-Autostart')
$ownsMutex = $false
$workers = @{ relay = $null; tunnel = $null }
try {
    try { $ownsMutex = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { exit 0 }
    $script:node = Resolve-Node
    Write-StartupLog ('Launcher running for {0} with {1}.' -f $Repo, $script:node)
    $lastStart = @{ relay = [DateTime]::MinValue; tunnel = [DateTime]::MinValue }
    $delays = @{ relay = 0; tunnel = 0 }
    while ($true) {
        foreach ($name in @('relay', 'tunnel')) {
            $process = $workers[$name]
            if ($null -eq $process -or $process.HasExited) {
                if ($null -ne $process) {
                    $process.WaitForExit()
                    Write-StartupLog ('{0} exited with code {1}.' -f $name, $process.ExitCode)
                    $process.Dispose()
                    $workers[$name] = $null
                    # 起動して30秒以内に落ちる時は設定や環境の問題（設定がない、ポートが使用中など）なので、ゆっくり試し直す。
                    $delays[$name] = if (((Get-Date) - $lastStart[$name]).TotalSeconds -lt 30) { 60 } else { 10 }
                }
                if (((Get-Date) - $lastStart[$name]).TotalSeconds -ge $delays[$name]) {
                    try { $workers[$name] = Start-Worker $name; $lastStart[$name] = Get-Date }
                    catch { Write-StartupLog ('{0} could not start: {1}' -f $name, $_.Exception.Message); $lastStart[$name] = Get-Date }
                }
            }
        }
        Start-Sleep -Seconds 5
    }
}
finally {
    foreach ($process in $workers.Values) { if ($null -ne $process -and -not $process.HasExited) { try { $process.Kill() } catch {} } }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
