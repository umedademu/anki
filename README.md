# Anki

毎日の学習と復習を支える学習用Webアプリです。

## 現在の内容

現在は、アプリ名を表示する初期ページを用意しています。

## フォルダ構成

- `public`：Web上で公開するページと見た目の設定
- `docs`：仕様書と更新情報
- `vercel.json`：Vercelの公開設定

## 手元で表示する方法

プロジェクトのフォルダで次の命令を実行し、ブラウザで
`http://localhost:3000` を開きます。

```powershell
python -m http.server 3000 --directory public
```

## Vercelで公開する方法

Vercelにこの保管場所を取り込み、設定を次のとおりにします。

- 使用する仕組み：`Other`
- 組み立て命令：空欄
- 公開フォルダ：`public`

公開フォルダは `vercel.json` にも設定済みです。
