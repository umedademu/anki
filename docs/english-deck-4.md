# 英単語Deck 4

v0.401で、利用者が作成した「共通テスト標準500語」を英単語のDeck 4へ追加しました。暗記・聞き流し、通常の科目選択と毎日のメニューで、他の英単語デッキと同じ学習方法を使用できます。

- 元原稿：`data/source/english-vocabulary/english_vocabulary_deck4_common_test_standard_500.csv`
- 500行の10列形式。単語番号は `EN-001501`〜`EN-002000`、順位は1501〜2000
- 1語から「英語から意味」「意味から英語」「例文から和訳」を各1問ずつ作り、各500問・合計1,500問にする
- 英単語全体はDeck 1〜4の2,000語・6,000問。初期の選択先はDeck 1のまま保持する
- 新規デッキの履歴版：`english-vocabulary-deck-4-v1`、今回の内容版：`74e7eb0494be`
- 保存先：Cloudflare R2の `subjects/english-vocabulary/imports/deck-4/74e7eb0494be/`。50語ずつの分割データ10件と索引1件を登録する

## 点検と補足

500語すべての単語・意味・例文・和訳、必須欄、単語番号・順位の連続、ファイル内の重複を確認しました。既存Deck 1〜3の1,500語はCloudflareから読み、単語・用語番号・問題番号の重複がないことを確認しています。変化形を使う例文では `strike→struck`、`slide→slid`、`sweep→swept` も確認しました。

`premise`（EN-001597）の別解だけ、元原稿の「建物の敷地」を「（premisesの形で）建物・敷地」と補足しています。単数形の「前提」と区別して覚えられるようにしたもので、単語・意味の本体・例文・和訳と、他の499行の内容は変更していません。根拠は[Cambridgeのpremise](https://dictionary.cambridge.org/dictionary/english/premise)と[premises](https://dictionary.cambridge.org/dictionary/english/premises)です。利用者のDownloads内の元ファイルは変更しません。

- 元ファイルのSHA-256：`b5833787a3ab228d66c9faec516e501df79c962510a6f6c6906b457bbbd8bfb1`
- 取り込み原稿のSHA-256：`74e7eb0494bee008b88b5f071432cb7edc13f783b25737414f4bcbc93dfeca22`

## Cloudflareへの追加

`npm run preview:data:english-deck-4`でCloudflare上の現行データを読み、件数と重複を確認します。`npm run publish:data:english-deck-4`で、確認した新規データだけを登録します。

1. Cloudflareの現行索引と既存Deck 1〜3の索引・全分割データを取得して照合値を記録する
2. 一時的なアクセスキーで保護した専用保存窓口を用意し、現行索引が確認時点から変わっていないことを再確認する
3. Deck 4の分割データ10件と索引を登録し、Cloudflareから読み返して全文を照合する
4. 既存データの照合値が一致した場合だけ、現行索引の識別情報を条件に英単語の一覧・件数へDeck 4を追加する
5. 追加後の索引と既存Deck 1〜3を再照合し、作業用保存窓口と一時設定を削除する

既存デッキの本文・番号・履歴版・索引参照先、他科目、画像一覧、音声、D1の学習記録は変更しません。切り替え前の索引はCloudflare上へ復旧用に残します。再実行は登録済み内容が一致する場合だけ何もせず終了し、公開後の本文編集や異なる内容での再登録を拒否します。

## 確認方法

`node scripts/test-english-deck-4.mjs`で全500語・1,500問の原稿照合、三方向の出題と音声内容、段階移行、重複、既存科目の保持、登録失敗・競合・再送・認証を確認します。`npm run check`にも組み込んでいます。

`npm run test:english-deck-4:browser`ではCloudflare上の問題集を読み、4デッキの選択と暗記・聞き流しの三方向を確認します。学習記録の通信だけを試験用の窓口へ送り、利用者の実際の記録を変更しません。自動読み上げは試験開始前にOFFにし、実際の音声は再生しません。本番の接続元制限は保ち、試験用画面へ渡す応答だけを調整します。

`public/data`に置いた同じデータは手元の検査専用です。本番の単語集の読み込み・保存先には使いません。
