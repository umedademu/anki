# サファヴィー朝の人物・建物・道具の画像

v0.186（2026年9月5日）。内蔵の画像生成を使用した。外部APIを直接使う方法は使用していない。

## 保存先

すべて `public/images/safavid/` に保存。人物は128×192画素、建物・道具・乗り物は192×192画素の透過PNG。
生成した画像集を升目ごとに切り出し、最近傍方式で縮小した。生成された透明度を維持しており、ブラウザーから画像生成サービスへ接続することはない。

| 名前 | 内容 |
| --- | --- |
| ismail-calm / ismail-march / ismail-worried | イスマーイール1世の平常（建国）・進軍・敗戦（困り顔） |
| qizilbash-warrior | キジルバシュ戦士（赤い12本ひだの帽子「タッジ」・鎧兜・刀と盾） |
| selim-angry | オスマン帝国スルタン・セリム1世（大ターバン・威圧感） |
| shia-scholar | 十二イマーム派学者（緑の法服・白ターバン・書物） |
| abbas-calm / abbas-march / abbas-happy | アッバース1世の平常（威厳）・進軍（指揮）・笑顔（世界の半分） |
| gholam-soldier | グラーム兵士（コーカサス出身の王直属軍・マスケット銃） |
| armenian-merchant | アルメニア商人（毛皮縁の帽子・絹織物の反物を持つ） |
| late-shah-worried | 後期サファヴィー君主（スルターン・フサイン模式・困惑・衰退） |
| afghan-warrior | アフガン戦士（ギルザイ系・褐色のターバン・湾刀） |
| nadir-shah | ナーディル＝シャー（4角の帽子・武人君主） |
| ahmad-durrani | アフマド＝シャー＝ドゥッラーニー（ドゥッラーニー朝君主） |
| agha-mohammad | アーガー＝ムハンマド＝シャー（高いカージャール冠） |
| shah-mosque | 王のモスク（イスファハーンの青いドームと尖塔） |
| ali-qapu | 王宮（アールィー・カープー宮殿・テラス高楼） |
| caravanserai | 隊商宿（キャラヴァンサライ・城壁風の宿） |
| english-ship | イギリス東インド会社の帆船（ホルムズ島奪取に協力） |
| silk-fabric | 生糸・絹織物の反物束 |
| cannon | 大砲（火器部隊の象徴） |

上記の名前に `.png` を付けたファイルを保存。
生成した表情違いのうち、特定の場面の演出（チャルディラーンの戦い後の敗北表情や、イスファハーン繁栄時の笑顔など）にも活用する。

## 人物画像集の最終生成指示

```text
Use case: illustration-story.
Asset type: one transparent PNG character sprite atlas for a Japanese interactive history map about the Safavid dynasty.
Create a precise 4-column by 4-row character sprite sheet, 1024 x 1536 pixels. Each cell is 256x384. ONE fully visible figure centered per cell, consistent 3-head-tall chibi proportions, feet aligned near each cell bottom, transparent padding around all props. Real transparent alpha, no backdrop, no text, no labels, no grid lines or ground shadows.
Style: charming Famicom-like 8-bit pixel art, clear square pixel steps, thick black outlines, rich but limited colors, large expressive faces readable at 80 pixels tall. No smooth vector illustration, no realism. Historical costumes are symbolic educational designs.
Exact cell order:
ROW 1:
1 Ismail I, young charismatic shah with red hair/beard, red turban with tall red baton-like wrapped top (Taj-i Haydari) with gold brooch, rich royal red robe, calm confident smile with hands down;
2 SAME Ismail I holding a small curved saber with determined campaigning eyebrows;
3 SAME Ismail I looking worried and surprised with hands raised, no weapon;
4 Qizilbash warrior with distinctive red 12-fluted baton headdress (Taj), steel cuirass, black moustache, holding small round shield and sword.
ROW 2:
1 Selim I of Ottoman Empire, middle-aged with thick grey beard, enormous white Ottoman imperial turban with red crest, red and gold caftan, fierce confident expression;
2 Shia Islamic scholar with white turban, flowing emerald-green religious robe, gentle dignified face, holding an open leather-bound book;
3 Shah Abbas I, middle-aged with distinctive long drooping black handlebar moustache, ornate black and gold turban with large emerald aigrette, turquoise and gold royal robe, stately calm face;
4 SAME Abbas I with determined heroic expression, drawing a curved sword forward.
ROW 3:
1 SAME Abbas I smiling warmly with open welcoming hands;
2 Gholam royal guard soldier with Caucasian tall astrakhan fur cap, deep blue coat, boots, holding a medieval matchlock musket upright;
3 Armenian merchant with dark fur-trimmed cap, maroon robe, friendly smile holding a bolt of shimmering silk fabric;
4 Late Safavid weak shah (Sultan Husayn) with drooping beard, oversized ornate jeweled crown, sad exhausted drooping expression with hands limp.
ROW 4:
1 Afghan Ghilzai tribal warrior with earthy brown turban, black beard, tan vest, fierce resolute face holding curved scimitar;
2 Nader Shah with unique four-pointed peaked hat (kolah-e Naderi), rugged warrior beard, armored coat, stern fierce conqueror expression;
3 Ahmad Shah Durrani with Afghan regal turban, navy and gold coat, dark beard, proud founder face;
4 Agha Mohammad Shah of Qajar with very tall black astrakhan cylindrical Qajar crown (kolah), rich brocade coat, lean stern face.
All figures fully inside their cell. Consistent thick outlines and pixel scale. Genuine transparent background, no scenery or decorative frames.
```

## 建物・道具・乗り物の最終生成指示

```text
Use case: illustration-story.
Asset type: one transparent PNG prop sprite atlas for a pixel-art historical teaching map of Safavid Iran.
Create a precise 3-column by 2-row sprite sheet, 1536 x 1024 pixels, each cell 512 x 512. One object centered in each cell with ample transparent margin. Genuine transparent alpha background. No text, no labels, no borders, no ground rectangle, no people.
Style: charming Famicom-like pixel art matching chibi medieval Persian characters, crisp square pixels, stepped dark outlines, rich blue turquoise gold cream terracotta palette. Each object must read at 70-110 pixels on a map.
Exact cell order:
TOP ROW:
1 Symbolic Shah Mosque (Masjid-e Shah) of Isfahan, brilliant turquoise-blue bulbous tiled dome with twin slender turquoise minarets and ornate arched portal (iwan);
2 Symbolic Ali Qapu palace pavilion of Isfahan, tall tiered terracotta and cream building with wide covered high balcony supported by slender pillars;
3 Symbolic roadside Caravanserai (desert inn), sturdy square fortified mudbrick inn with round corner towers, arched crenellated entrance gate.
BOTTOM ROW:
1 17th-century English East India Company galleon sailing ship with three masts, white billowing square sails, wooden hull with cannon gunports, sea waves below;
2 Bolts of luxurious Persian raw silk and woven silk textiles in gold, crimson and azure folded on a small carpet;
3 Medieval bronze cannon on a wooden wheeled carriage, facing right.
Historical educational symbols. Each object fully within its cell. Transparent between and around objects, no shadows or scenery filling the cells.
```
