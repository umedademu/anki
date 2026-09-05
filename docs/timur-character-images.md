# ティムールの人物画像

v0.183（2026年9月5日）で人物を透過PNGへ置き換え、v0.187で隣接コマの混入除去と中心軸の格子合わせ（左右中央揃え）を実施。

## 作成方法と保存先

内蔵の画像生成を使用。約3頭身のファミコン風ドット絵を、表情違いも含めた4列×4行の人物画像集として一度に生成した。背景の透明度を保持し、画像集の各升目を切り出して128×192画素へ最近傍方式で縮小した。v0.187にて、升目切り分け時に隣のコマが端に写り込んでいたゴミを除去し、各キャラクターの中心軸を画像の横中央（64画素）へ揃えて歩行や表情切り替え時のブレを解消した。読み込み時に画像生成への通信は発生しない。

実際に使用する16枚は `public/images/timur/` に保存する。地形は既存のSVGのまま、人物だけをPNGの画像要素で表示する。

| 画像名 | 内容 |
| --- | --- |
| timur-calm.png / timur-happy.png / timur-march.png / timur-ill.png | ティムールの平常・笑顔・進軍・病気 |
| princess-calm.png / princess-happy.png | 王女の平常・笑顔 |
| genghis.png | 王女の祖先としてのチンギス＝ハン |
| scholar.png | 学ぶ人の模式図 |
| tokhtamysh-angry.png / tokhtamysh-worried.png | トクタミシュの対決前後 |
| bayezid-angry.png / bayezid-sad.png | バヤジット1世の対決前後 |
| ruler-calm.png / ruler-worried.png / ruler-happy.png | 各地の勢力などの模式図 |
| ming.png | 明の皇帝の模式図 |
| war-elephant.png | インドの戦象（トゥグルク朝軍の戦象・赤金の装飾布） |
| timur-cavalry.png | ティムール軍騎兵（青い鎧と兜・馬に乗って弓矢を構える） |

生成した衣装・肖像・表情は理解を助ける演出で、史料上の肖像を再現したものではない。個人名を特定しない人物は地図にも「模式」と表示する。
v0.188にて、デリー遠征の象徴であるトゥグルク朝の「インド戦象」およびアンカラ等の大決戦を支える「ティムール軍騎兵」を追加実装した。

## 生成に使った指示

以下が内蔵画像生成に渡した最終指示の全文。

```text
Use case: illustration-story.
Asset type: one transparent PNG character sprite atlas for a Japanese history teaching map.
Create a 4-column by 4-row sprite sheet, 1024 x 1536 pixels. Each cell is 256 wide by 384 high, with ONE full-body character centered, all figures the same three-head-tall chibi proportions. Keep every figure fully inside its cell with generous transparent padding, feet on the same baseline in each row. Genuine transparent alpha background, NO text, NO labels, NO grid lines, NO scenery, NO shadows outside the character.
Style: 8-bit Famicom-like pixel art, crisp square pixels, black stepped outlines, limited rich colors, no smooth vector edges. Like a cute historical warrior with a large expressive face, black beard, ornate blue and gold helmet and armor, dark red cape, tiny boots. Faces must stay readable at 70 pixels tall. Medieval clothing is symbolic, not a documentary portrait. No photorealism.
Exact cell order, left to right:
ROW 1: the SAME Timur character in blue/gold helmet and armor, black beard, red cape, in four expressions: 1 calm neutral with hands lowered, 2 warm happy smile hands open for marriage, 3 fierce determined eyebrows holding a small sword for campaigning, 4 ill and exhausted with closed eyes and slumped posture (still full body upright).
ROW 2: 1 Mongol princess in pink and ivory robes, golden headdress, calm expression; 2 SAME princess smiling warmly with hands open; 3 Genghis Khan with brown fur hat and brown/gold robe, black beard, stately calm face; 4 learned Central Asian man with green robe and white turban, gentle smile holding a small book.
ROW 3: 1 Tokhtamysh with purple robe and dark fur hat, black beard, angry confident expression; 2 SAME Tokhtamysh visibly surprised and worried; 3 Bayezid I with red robe and large white Ottoman turban, beard, angry confident face holding a small sword; 4 SAME Bayezid looking sad with hands lowered and NO sword.
ROW 4: 1 generic local ruler in tan/gold robe and small crown, confident neutral face; 2 SAME ruler shocked worried face with arms raised; 3 SAME ruler happy relieved face hands open; 4 symbolic Ming ruler in red and gold robes with traditional black winged imperial hat, composed face.
Maintain EXACT 4x4 grid placement and no extra characters. All cells have the same scale, no props crossing cell boundaries, no speech balloons. Each sprite uses a visibly low-resolution pixel grid and simple readable facial expression.
```
