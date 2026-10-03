# 日本史Kの関連画像

## 第１回（v0.311、2026年10月4日）

１回の作業を３小項目・12枚程度に絞り、画像の実物、元の説明、年代と場所、作者と利用条件、問答との対応を１枚ずつ確認する。初回は第６章第１節の「ＧＨＱの占領政策」「大日本帝国憲法の改正」「冷戦と朝鮮戦争」を対象とし、画像が適する43問に12枚を追加する。抽象的な法律の内容や、写真では示せない地理関係まで同じ画像を一律に付けない。全141小項目への画像追加完了を意味しない。

世界史と同じ関連画像欄へ、回答後だけ表示する。問題ごとの固定指定とし、人物名を問う前の問題で肖像の説明から名前を先に教えない。問題面、次問への移動時、画像未指定の問題では画像と代替説明を消去する。説明・作者・利用条件を併記し、画像自体を外部サイトへのリンクにせず、画像の説明を自動読み上げに含めない。画像を取得できなくても、問題・回答・解説と評価を使える。

公布原本は施行日だけを尋ねる問題には付けず、戦争中の写真は戦争に先立つ朝鮮半島の分断を尋ねる問題には付けない。画像にある日付や場面を、その問いの出来事と取り違えない組合せに絞る。

## 選んだ画像

| 画像 | 用途と出典 |
| --- | --- |
| ＧＨＱが置かれた第一生命館 | 機関と統治の拠点。[元画像](https://commons.wikimedia.org/wiki/File:GHQ_building_circa_1950.JPG) |
| マッカーサー | 最高司令官の人物と改革方針。[元画像](https://commons.wikimedia.org/wiki/File:MacArthur_Manila.jpg) |
| 財閥家族の資産差し押さえ | 財閥解体の実際の場面。[元画像](https://commons.wikimedia.org/wiki/File:Seizure_of_the_Zaibatsu_families_assets.JPG) |
| 日本国憲法の原本 | 御名御璽と大臣の副署の頁。基本原理や第九条の掲載頁とは扱わない。[元画像](https://commons.wikimedia.org/wiki/File:Nihon_Kenpo02.jpg) |
| 大日本帝国憲法の原本 | 御名御璽と大臣の副署の頁。旧憲法の名称と改正手続きの説明。[元画像](https://commons.wikimedia.org/wiki/File:Meiji_Kenpo03.jpg) |
| 国際連合の旗 | 国際機関の識別と日本の加盟。常任理事国や本部所在地の証拠画像にはしない。[元画像](https://commons.wikimedia.org/wiki/File:Flag_of_the_United_Nations.svg) |
| 毛沢東 | 建国の指導者の肖像。蔣介石や台湾の問題には使わない。[元画像](https://commons.wikimedia.org/wiki/File:Mao_Tse_Tung.jpg) |
| 朝鮮戦争の写真 | 戦闘・避難・軍用機による全体の説明。三八度線の位置を示す地図とは扱わない。[元画像](https://commons.wikimedia.org/wiki/File:Korean_War_Montage_2.png) |
| サンフランシスコ講和条約の署名場面 | 1951年の条約署名。最初の名称問題の画像説明に署名者名を入れない。[元画像](https://commons.wikimedia.org/wiki/File:Yoshida_signs_San_Francisco_Peace_Treaty.jpg) |
| 改定された日米安全保障条約の署名原本 | 1960年の条約原本。1951年の旧安保条約や署名中の場面の写真とは扱わない。[元画像](https://commons.wikimedia.org/wiki/File:Japan_US_Treaty_of_Mutual_Security_and_Cooperation_19_January_1960.jpg) |
| 国会を取り囲むデモ隊 | 安保闘争の大規模な反対運動。[元画像](https://commons.wikimedia.org/wiki/File:1960_Protests_against_the_United_States-Japan_Security_Treaty_07.jpg) |
| ケネディ | キューバ危機で大統領の名を答えた後の肖像。[元画像](https://commons.wikimedia.org/wiki/File:John_F._Kennedy,_White_House_color_photo_portrait.jpg) |

既存のキューバ危機用のミサイル写真は、元の説明では1965年のモスクワの軍事パレードを写したものだった。キューバの配備基地や1962年の危機を写した史料として流用しない。他科目にある既存の画像説明・割り当ては変更しない。

## 保存と更新

作成用の指定は `data/source/japanese-history-k/image-assignments.json` に記録する。各画像の選定理由と問題の識別番号を固定し、Cloudflareの現行問題・共通画像一覧・既存画像本体を読んで、対象の問答が存在することと画像の説明・作者・利用条件を確認する。本番の読み書きへ `public/data` を使わない。

1. `npm run preview:images:japanese-history-k` でCloudflareから取得し、確認用の一覧・問答と画像の対応表・取得内容の識別値を `.wrangler/japanese-history-k-images/` へ出力する。
2. 対応表と12枚の実物を点検し、`npm run test:images:japanese-history-k` と `npm run test:images:japanese-history-k:browser` で、保存範囲・表示・取得失敗時の継続を確認する。画面試験は開始前から自動読み上げをOFFにし、音声ファイル・端末音声・効果音も遮断する。
3. `npm run publish:images:japanese-history-k` で、点検時の問題・画像一覧・指定が保持されていることを確認する。認証付きの作業用保存窓口で再取得した画像一覧の版を条件に、共通の `term-images.json` だけを更新し、全文照合する。

写真・史料の本体はCloudflareにある登録済み画像を共有し、二重登録・加工をしない。日本史K用の画像説明は別の識別名で追加するため、世界史・日本史などにある元の画像説明を上書きしない。既存の画像本体・用語の基準画像・問題別の指定を保持する。同じ指定の再実行は追加を行わず、編集済みの指定や点検後の同時編集は拒否する。旧一覧はCloudflareの `term-images-history/japanese-history-k/` に保持し、作業用窓口は処理後に削除する。

問題本文・答え・解説、科目一覧、問題番号、小項目数・学習項目数・問題数、内容版・履歴版とD1の学習記録は画像追加で変更しない。既存の画像欄を使うため、学習画面の表示処理も版参照以外は変更しない。
