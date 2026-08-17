# Anki

用語から複数の問いへ進み、最後に知識をつなげて確認する「逆一問一答」形式の学習用Webアプリです。

## 現在の内容

現在は、世界史100用語・400問を使って学習できます。

1つの用語について質問と答えを順番に確認し、すべて終わると統合説明を表示します。質問数は固定せず、元データに存在する分だけ表示します。

## フォルダ構成

- `public`：Web上で公開するページと見た目の設定
- `public/data`：CSVから生成したWeb表示用の分割データ
- `data/source`：科目ごとの元CSV
- `scripts`：元CSVからWeb表示用データを生成・検証する処理
- `docs`：仕様書と更新情報
- `vercel.json`：Vercelの公開設定

## 学習データを更新する方法

元CSVを更新したあと、次の命令でWeb表示用データを作り直します。

```powershell
npm run build:data
npm run check
```

Cloudflare R2との接続後は、生成された`public/data`内のファイルをR2へ登録し、WebアプリはR2の公開URLから直接読み込みます。

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
