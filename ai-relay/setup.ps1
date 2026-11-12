# 暗記アプリの「AIに質問」用の中継役の初回設定。
# 1. アプリのアクセスキー（設定ページで登録しているもの）を保存する。
# 2. Claude 用の1年有効なログイン用の合言葉（claude setup-token。サブスクの範囲で動く）を作って保存する（任意）。
# 3. Codex（ChatGPTでログイン済み）が使えるか確かめる。
# 保存場所は %USERPROFILE%\.anki-ai（gonta の %USERPROFILE%\.gonta とは別）。合言葉はこのWindowsユーザーだけが
# 読めるように暗号化（DPAPI）し、画面とログには残さない。
$ErrorActionPreference = 'Stop'
$state = Join-Path $env:USERPROFILE '.anki-ai'
$configFile = Join-Path $state 'config.json'
$tokenFile = Join-Path $state 'claude-oauth-token.dpapi'
$infoFile = Join-Path $state 'claude-oauth-token.json'
$workerUrl = 'https://anki-progress-api.umedademu.workers.dev'
New-Item -ItemType Directory -Path $state -Force | Out-Null

function Read-Secret([string]$label) {
    $secure = Read-Host $label -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host ''
Write-Host '=== 暗記アプリ「AIに質問」の中継役の設定 ===' -ForegroundColor Cyan

# --- 1. アクセスキー ---
$config = [ordered]@{}
if (Test-Path -LiteralPath $configFile) {
    $saved = Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($property in $saved.PSObject.Properties) { $config[$property.Name] = $property.Value }
}
$askKey = $true
if ($config.accessKey) {
    $answer = Read-Host 'アクセスキーは保存済みです。入れ直しますか？（y = はい / Enter = そのまま）'
    $askKey = $answer -match '^[yY]'
}
if ($askKey) {
    Write-Host ''
    Write-Host 'アプリの設定ページで登録している「Cloudflareのアクセスキー」を貼り付けて Enter を押してください。'
    Write-Host '（右クリックで貼り付けられます。貼り付けても画面には表示されません）'
    $key = Read-Secret 'アクセスキー'
    if ($key.Length -lt 8) { throw 'アクセスキーが短すぎます。もう一度実行してください。' }
    try {
        Invoke-RestMethod -Uri "$workerUrl/v1/ai-relay" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 15 | Out-Null
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 401) { throw 'アクセスキーが正しくありません。アプリの設定ページのものを貼り付けてください。' }
        Write-Host ('アクセスキーを確かめられませんでした（{0}）。このまま保存します。' -f $_.Exception.Message) -ForegroundColor Yellow
    }
    $config['accessKey'] = $key
    $key = $null
}
if (-not $config.allowedOrigins) { $config['allowedOrigins'] = @('https://anki-ume.vercel.app') }
if (-not $config.claude) { $config['claude'] = [ordered]@{ model = 'sonnet' } }
if (-not $config.codex) { $config['codex'] = [ordered]@{ effort = 'low' } }
$json = $config | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($configFile, $json, (New-Object Text.UTF8Encoding $false))
Write-Host 'アクセスキーを保存しました。' -ForegroundColor Green

# --- 2. Claude の合言葉 ---
Get-ChildItem env: | Where-Object { $_.Name -match '^(CLAUDE|ANTHROPIC_)' } | ForEach-Object { Remove-Item -LiteralPath ('env:' + $_.Name) }
$claude = $null
foreach ($candidate in @((Join-Path $env:APPDATA 'npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe'), (Join-Path $env:USERPROFILE '.local\bin\claude.exe'))) {
    if (Test-Path -LiteralPath $candidate) { $claude = $candidate; break }
}
if (-not $claude) { $command = Get-Command claude -ErrorAction SilentlyContinue; if ($command) { $claude = $command.Source } }
Write-Host ''
if (-not $claude) {
    Write-Host 'Claude Code（claude）が見つかりません。Claude で聞く機能は使えません。' -ForegroundColor Yellow
} else {
    Write-Host 'Claude は、PCのふだんのログインだと約2週間で切れます。1年有効な合言葉を作ると、切れにくくなります。'
    $answer = Read-Host '合言葉を作りますか？（y = はい / Enter = 今はしない）'
    if ($answer -match '^[yY]') {
        Write-Host '1. このあとブラウザが開きます。Claude の画面で「承認（Authorize）」を押してください。'
        Write-Host '2. この黒い画面に「sk-ant-oat」で始まる長い文字列が表示されます。それをコピーしてください。'
        & $claude setup-token
        if ($LASTEXITCODE -ne 0) { throw ('claude setup-token が終了コード {0} で止まりました。もう一度実行してください。' -f $LASTEXITCODE) }
        Write-Host '3. コピーした文字列を、下に貼り付けて Enter を押してください。（貼り付けても表示されません）' -ForegroundColor Cyan
        $plain = Read-Secret '合言葉'
        if ($plain -notmatch '^sk-ant-\S{20,}$') { $plain = $null; throw '貼り付けた文字列の形が違います。sk-ant-oat で始まる文字列をそのまま貼り付けてください。' }
        $clean = ConvertTo-SecureString -String $plain -AsPlainText -Force
        $plain = $null
        $clean | ConvertFrom-SecureString | Set-Content -LiteralPath $tokenFile -Encoding ASCII
        $now = Get-Date
        [ordered]@{ created = $now.ToString('o'); expires = $now.AddDays(365).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $infoFile -Encoding UTF8
        Write-Host ('保存しました。有効期限はおよそ {0:yyyy年M月d日} です。' -f $now.AddDays(365)) -ForegroundColor Green
    }
}

# --- 3. Codex ---
$codex = Join-Path $env:APPDATA 'npm\node_modules\@openai\codex\bin\codex.js'
$node = Get-Command node.exe -ErrorAction SilentlyContinue
Write-Host ''
if ((Test-Path -LiteralPath $codex) -and $node) {
    & $node.Source $codex login status
    Write-Host '上に「Logged in using ChatGPT」と出ていれば、ChatGPT で聞く機能が使えます。出ていなければ codex login を実行してください。'
} else {
    Write-Host 'Codex CLI（codex）が見つかりません。ChatGPT で聞く機能は使えません。' -ForegroundColor Yellow
}
# --- 4. 自動起動 ---
Write-Host ''
Write-Host 'PCにログインしたとき、中継役と専用のトンネルが画面なしで自動で起動するように登録できます。'
Write-Host '（タスク AnkiAI-Autostart。落ちても自動で起動し直します。外すときは ai-relay\uninstall-autostart.cmd）'
$answer = Read-Host '自動起動を登録しますか？（Enter = はい / n = しない）'
if ($answer -notmatch '^[nN]') {
    & (Join-Path $PSScriptRoot 'install-autostart.ps1')
    Write-Host ''
    Write-Host '設定が終わりました。いま中継役を起動したので、1分ほどでアプリの「AIに質問」が使えます。' -ForegroundColor Green
    Write-Host '新しいプログラムを読み込ませたいときは ai-relay\restart.cmd をダブルクリックしてください。'
} else {
    Write-Host ''
    Write-Host '設定が終わりました。ai-relay\start.cmd をダブルクリックすると中継役が動きます（画面を閉じると止まります）。' -ForegroundColor Green
}
