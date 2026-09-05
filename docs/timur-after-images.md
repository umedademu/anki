# 続編の人物・建物・道具の画像

v0.184（2026年9月5日）。内蔵の画像生成を使用した。外部APIを直接使う方法は使用していない。

## 保存先

すべて `public/images/timur-after/` に保存。人物は128×192画素、建物・道具・動物は192×192画素の透過PNG。
生成した画像集を升目ごとに切り出し、最近傍方式で縮小した。生成された透明度を維持しており、ブラウザーから画像生成サービスへ接続することはない。

| 名前 | 内容 |
| --- | --- |
| shahrukh-calm / shahrukh-happy / shahrukh-walk / shahrukh-old | シャー＝ルフの表情と姿 |
| ulugh-scholar / ulugh-king / ulugh-worried / ulugh-fallen | ウルグ＝ベクの学者姿、統治者、困り、最期 |
| shaybani-march / shaybani-happy | シャイバーニーの進軍と勝利 |
| kazakh / russian-soldier / uzbek-ruler | カザフの指導者・ロシアの軍人・各地の支配者の模式図 |
| painter / poet / merchant | 画家・詩人・商人の模式図 |
| palace / observatory / miniature / poetry / camel / market | 宮殿・天文台・細密画・詩集・荷物を積むラクダ・市場 |

上記の名前に `.png` を付けたファイルを保存。前編の匿名の支配者・学ぶ人の画像も一部再利用し、後世の人物をウルグ＝ベクやシャイバーニーの画像で代用しない。
生成した表情違いのうち、今の場面で使用しないものも将来の調整用として同じフォルダーに保存した。

## 人物画像集の最終生成指示

```text
Use case: illustration-story.
Asset type: one transparent PNG sprite atlas for a Japanese interactive history map, sequel to a Timur story.
Create a precise 4-column by 4-row character sprite sheet, 1024 x 1536 pixels. Each cell is 256x384. ONE fully visible figure centered per cell, consistent 3-head-tall chibi proportions, feet aligned near each cell bottom, transparent padding around all props. Real transparent alpha, no backdrop, no text, no labels, no grid lines or ground shadows.
Style: charming Famicom-like 8-bit pixel art, clear square pixel steps, thick black outlines, rich but limited colors, large expressive faces readable at 80 pixels tall. No smooth vector illustration, no realism. Medieval Central Asian costumes are symbolic educational designs.
Exact cell order:
ROW 1: SAME Shah Rukh, middle-aged with short dark beard, jade-green and gold royal robe, white wrapped turban with golden central jewel: 1 calm thoughtful hands down; 2 warm smile, welcoming open hands; 3 determined walking pose with one boot raised, empty hands (no sword); 4 elderly tired expression eyes closed, shoulders slumped, still standing full body.
ROW 2: SAME Ulugh Beg, dark short beard, indigo and gold robe, tall white turban with blue jewel: 1 cheerful astronomer holding a gold astrolabe and an open star book; 2 composed king with hands down; 3 worried surprised king with hands raised; 4 eyes closed and head bowed, no blood and no violence.
ROW 3: 1 Muhammad Shaybani, dark moustache and beard, orange and gold coat, brown fur cap, determined eyebrows holding small sword; 2 SAME Shaybani smiling confidently, hands open, no sword; 3 symbolic Kazakh chief with turquoise robe, white and brown fur hat, moustache, calm confident face; 4 symbolic 19th-century Russian imperial soldier in dark green double-breasted coat, black peaked cap, boots, neutral face, no weapon.
ROW 4: 1 miniature painter in rose robe and small cap holding brush and a little illustrated manuscript; 2 poet in cream and plum robes, turban, happy face holding an open manuscript; 3 friendly merchant in tan robe and cap carrying a bundle of colorful rolled cloth; 4 symbolic Uzbek local ruler in purple and gold coat, fur cap and small moustache, dignified calm face.
All figures fully inside their cell. Consistent thick outlines and pixel scale. Genuine transparent background, no scenery or decorative frames.
```

## 建物・道具・動物の最終生成指示

```text
Use case: illustration-story.
Asset type: one transparent PNG prop sprite atlas for a pixel-art historical teaching map.
Create a precise 3-column by 2-row sprite sheet, 1536 x 1024 pixels, each cell 512 x 512. One object centered in each cell with ample transparent margin. Genuine transparent alpha background. No text, no labels, no borders, no ground rectangle, no people.
Style: charming Famicom-like pixel art matching chibi medieval Central Asian characters, crisp square pixels, stepped dark outlines, restrained blue turquoise gold cream terracotta palette. Each object must read at 70-110 pixels on a map.
Exact cell order:
TOP ROW: 1 a symbolic 15th-century Herat palace, tall turquoise tiled arched gateway with blue dome; 2 a symbolic medieval Samarkand astronomical observatory, cylindrical building with a visible large meridian arc instrument recessed in the middle, tiny star accents above; 3 an open illuminated Persian manuscript with a small miniature painting of a garden and pavilion, ornate gold borders.
BOTTOM ROW: 1 an open book of poetry with decorative calligraphic marks but no actual readable text, burgundy binding; 2 one friendly side-facing camel carrying rolled fabrics, saddlebags and bundles, full body; 3 a compact oasis market with a palm tree, arched gateway, and two small striped cloth stalls, no people.
Historical educational symbols, not precise architectural reconstructions. Observatory must have NO modern telescope, NO radar dish, NO sci-fi elements. Each object fully within its cell. Transparent between and around objects, no shadows or scenery filling the cells.
```
