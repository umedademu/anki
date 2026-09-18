// W-Historyの第20・21回の本文と地図の拠点を基にした位置の目安。
// 王朝は下記の主要拠点を示す。点や地方の色を領土境界として扱わない。
export const normalizeMapName = value => String(value).normalize("NFKC").replace(/[＝=・\-−―ー\s（）()「」『』【】]/gu, "");
export const atlas = [];
const add = (id, name, point, kind, aliases = [], note = "", context = [], extent = null) => {
  atlas.push({ id, name, point, kind, aliases: [name, ...aliases], note, context, ...(extent ? { extent } : {}) });
};
const city = (id, name, lon, lat, aliases = [], note = "", context = []) => add(id, name, [lon, lat], "city", aliases, note, context);
const region = (id, name, lon, lat, extent, aliases = [], note = "") => add(id, name, [lon, lat], "region", aliases, note, [], extent);
const polity = (id, name, seat, period, aliases = [], context = []) => {
  const place = atlas.find(p => p.id === seat);
  if (!place) throw Error(seat);
  add(id, name, place.point, "polity", aliases, `${period}。主要拠点：${place.name}。`, [seat, ...context]);
};

city("mecca", "メッカ", 39.83, 21.42, ["マッカ", "ヒラー山", "ヒラー洞窟", "カーバ", "ムハンマド", "ハーシム家", "クライシュ", "ミフラーブ"], "アラビア半島西部の聖地。", ["medina", "hijaz"]);
city("medina", "メディナ", 39.61, 24.47, ["マディーナ", "アブー＝バクル", "アブーバクル", "アブー＝アル＝バクル", "ウスマーン"], "メッカの北。初期イスラーム共同体の拠点。", ["mecca"]);
city("kufa", "クーファ", 44.4, 32.03, [], "イラク、ユーフラテス川沿い。アリーの政治拠点。", ["baghdad", "euphrates"]);
city("basra", "バスラ", 47.78, 30.51, ["ザンジュの乱"], "イラク南部、ペルシア湾につながる水運の拠点。", ["tigris", "euphrates"]);
city("damascus", "ダマスクス", 36.29, 33.51, ["ダマスカス", "アブド＝アルマリク", "ワリード1世"], "シリア内陸。ウマイヤ朝の都。", ["syria"]);
city("baghdad", "バグダード", 44.37, 33.32, ["バクダード", "知恵の館", "バイト＝アル＝ヒクマ", "バイト＝アルヒクマ", "マンスール", "ハールーン", "マームーン", "タバリー", "フワーリズミー", "ガザーリー", "ニザーミーヤ学院"], "ティグリス川沿い。アッバース朝の都・学問の拠点。", ["tigris", "iraq"]);
city("ctesiphon", "クテシフォン", 44.58, 33.09, [], "ティグリス川沿い。ササン朝の都。", ["tigris"]);
city("jerusalem", "イェルサレム", 35.21, 31.77, ["エルサレム", "岩のドーム"], "地中海東岸の内陸。", ["syria", "cairo"]);
city("cairo", "カイロ", 31.24, 30.04, ["アズハル", "コプト"], "ナイル川下流。エジプトの政治・交易の拠点。", ["nile", "egypt"]);
city("alexandria", "アレクサンドリア", 29.92, 31.2, [], "ナイル川河口付近、地中海に面する港。", ["nile", "cairo"]);
city("cordoba", "コルドバ", -4.78, 37.89, ["アブド＝アッラフマーン", "イブン＝ルシュド", "アヴェロエス"], "イベリア半島南部。後ウマイヤ朝の都。", ["iberia", "gibraltar"]);
city("granada", "グラナダ", -3.6, 37.18, ["アルハンブラ"], "イベリア半島南部。ナスル朝の都。", ["cordoba", "gibraltar"]);
city("gibraltar", "ジブラルタル海峡", -5.61, 35.96, ["ジブラルタル"], "イベリア半島と北アフリカの間。", ["iberia", "maghrib"]);
city("marrakech", "マラケシュ", -7.98, 31.63, [], "モロッコ内陸。サハラ交易につながる拠点。", ["maghrib", "sahara"]);
city("fes", "フェス", -5, 34.04, ["フェズ"], "モロッコ北部。イドリース朝の拠点。", ["maghrib"]);
city("tunis", "チュニス", 10.18, 36.8, ["チュニジア", "イブン＝ハルドゥーン", "世界史序説"], "北アフリカの地中海沿岸。", ["maghrib"]);
city("kairouan", "カイラワーン", 10.1, 35.68, [], "現在のチュニジア内陸。アグラブ朝の中心地。", ["tunis"]);
city("tangier", "タンジール", -5.81, 35.77, ["イブン＝バットゥータ", "三大陸周遊記", "大旅行記"], "モロッコ北端。イブン＝バットゥータの出身地。", ["gibraltar", "cairo", "delhi"]);
city("poitiers", "ポワティエ", 0.34, 46.58, ["トゥール", "ポワティエ", "カール＝マルテル"], "フランス西部。トゥールはこの北。", ["france", "iberia"]);
city("toledo", "トレド", -4.03, 39.86, [], "イベリア半島中部。西ゴート王国の都。", ["iberia"]);
city("bukhara", "ブハラ", 64.42, 39.77, ["イブン＝シーナー", "アヴィケンナ", "医学典範"], "アム川の北、中央アジアのオアシス都市。", ["amu", "samarkand", "transoxiana"]);
city("samarkand", "サマルカンド", 66.96, 39.65, ["ウルグ＝ベク", "ウルグベク"], "中央アジアのオアシス都市。ティムール朝の都。", ["bukhara", "amu", "transoxiana"]);
city("urgench", "ウルゲンチ", 59.15, 42.32, ["グルガンジュ"], "アム川下流のホラズム地方。ここでは旧ウルゲンチを示す。", ["khwarazm", "amu"]);
city("nishapur", "ニーシャープール", 58.79, 36.21, ["ニシャプール", "ウマル＝ハイヤーム", "ルバイヤート"], "イラン北東部、ホラーサーン地方。", ["khorasan", "herat"]);
city("merv", "メルヴ", 62.18, 37.66, [], "ホラーサーン地方のオアシス都市。", ["khorasan", "amu"]);
city("herat", "ヘラート", 62.2, 34.35, ["シャー＝ルフ", "バイソングル"], "アフガニスタン西部。ティムール朝後期の文化拠点。", ["khorasan"]);
city("tus", "トゥース", 59.5, 36.5, ["フィルドゥシー", "シャー＝ナーメ"], "ホラーサーン地方。フィルドゥシーの活動地。", ["khorasan", "nishapur"]);
city("ghazni", "ガズナ", 68.42, 33.55, ["ガズニー", "アルプテギン"], "アフガニスタン東部。北インドへ向かう拠点。", ["afghanistan", "indus"]);
city("ghor", "ゴール地方", 64.5, 34.5, [], "アフガニスタン中部の山岳地域。", ["afghanistan", "ghazni"]);
city("kabul", "カーブル", 69.17, 34.56, ["カブール"], "アフガニスタン東部。インドへの進出路の拠点。", ["khyber", "indus", "delhi"]);
city("khyber", "カイバル峠", 71.15, 34.08, ["ハイバル峠"], "アフガニスタンから北インド方面へ抜ける山道。", ["kabul", "indus"]);
city("kashgar", "カシュガル", 75.99, 39.47, [], "タリム盆地西端のオアシス都市。", ["central-asia"]);
city("balasagun", "ベラサグン", 75.3, 42.75, ["バラサグン", "耶律大石"], "天山山脈北側。カラ＝ハン朝・カラ＝キタイの主要拠点。", ["central-asia", "kashgar"]);
city("talas", "タラス河畔", 71.37, 42.9, ["タラス"], "中央アジア、現在のタラズ周辺。戦場の位置は概略。", ["central-asia", "balasagun"]);
city("zaranj", "ザランジュ", 61.86, 30.96, ["ザランジ"], "イラン東部とアフガニスタンの境に近いスィースターン地方。", ["afghanistan", "khorasan"]);
city("isfahan", "イスファハーン", 51.67, 32.65, ["アッバース1世", "王のモスク", "イマームのモスク"], "イラン高原中央部。サファヴィー朝の後期の都。", ["iran", "tabriz"]);
city("tabriz", "タブリーズ", 46.29, 38.08, ["イスマーイール1世", "ラシード＝アッディーン", "ガザン＝ハン"], "イラン北西部。イル＝ハン国・サファヴィー朝の都。", ["iran", "caucasus"]);
city("maragha", "マラーガ", 46.24, 37.39, [], "タブリーズの南。イル＝ハン国初期の都。", ["tabriz"]);
city("ardabil", "アルダビール", 48.3, 38.25, ["サファヴィー教団"], "イラン北西部。サファヴィー教団の拠点。", ["tabriz", "caucasus"]);
city("qazvin", "カズヴィーン", 50, 36.27, [], "カスピ海南側。サファヴィー朝の都の一つ。", ["tabriz", "isfahan"]);
city("tehran", "テヘラン", 51.39, 35.69, ["アーガー＝ムハンマド", "アガー＝ムハンマド"], "イラン北部。カージャール朝の都。", ["iran"]);
city("mashhad", "マシュハド", 59.61, 36.3, ["ナーディル＝シャー"], "ホラーサーン地方。アフシャール朝の都。", ["khorasan"]);
city("shiraz", "シーラーズ", 52.58, 29.61, ["サーディー", "ばら園"], "イラン南部、ファールス地方。ペルシア文学の拠点。", ["iran", "isfahan"]);
city("hormuz", "ホルムズ島", 56.46, 27.06, ["ホルムズ"], "ペルシア湾の出口に位置する交易拠点。", ["persian-gulf"]);
city("nihavand", "ニハーヴァンド", 48.37, 34.19, ["ニハヴァンド"], "イラン西部の戦場。", ["iran", "ctesiphon"]);
city("mosul", "モースル", 43.13, 36.34, ["ザンギー"], "イラク北部、ティグリス川沿い。", ["tigris", "baghdad"]);
city("konya", "コンヤ", 32.49, 37.87, [], "アナトリア中南部。ルーム＝セルジューク朝の都。", ["anatolia"]);
city("istanbul", "イスタンブル", 28.98, 41.01, ["コンスタンティノープル", "アヤソフィア", "ハギア＝ソフィア", "トプカプ", "スレイマニエ", "スレイマン＝モスク", "シナン", "スィナン", "金角湾", "ボスポラス", "メフメト2世", "アフメト3世"], "ボスポラス海峡沿い。ヨーロッパとアジアを結ぶ。", ["anatolia", "balkans", "black-sea"]);
city("sogut", "ソグート", 30.01, 40.02, ["オスマン1世"], "アナトリア北西部。オスマン朝発祥の地。", ["bursa", "anatolia"]);
city("bursa", "ブルサ", 29.06, 40.18, ["オルハン"], "アナトリア北西部。初期オスマン朝の都。", ["istanbul", "edirne"]);
city("edirne", "エディルネ", 26.56, 41.68, ["アドリアノープル", "ムラト1世"], "ヨーロッパ側のオスマン朝の都。", ["istanbul", "balkans"]);
city("ankara", "アンカラ", 32.85, 39.93, [], "アナトリア中央部。1402年の戦いの位置。", ["anatolia", "istanbul"]);
city("manzikert", "マラーズギルド", 42.54, 39.14, ["マンジケルト", "アルプ＝アルスラーン"], "アナトリア東部。1071年の戦いの位置。", ["anatolia", "iran"]);
city("chaldiran", "チャルディラーン", 44.35, 39.14, [], "イラン北西部、アナトリアとの接点。", ["tabriz", "anatolia"]);
city("kosovo", "コソヴォ", 21.16, 42.66, ["コソボ"], "バルカン半島内陸。", ["balkans", "edirne"]);
city("nicopolis", "ニコポリス", 24.89, 43.7, [], "ドナウ川沿い。", ["danube", "balkans"]);
city("varna", "ヴァルナ", 27.91, 43.21, ["ワルナ"], "バルカン半島東部、黒海沿岸。", ["black-sea"]);
city("vienna", "ウィーン", 16.37, 48.21, ["ヴィーン"], "ドナウ川沿い。ハプスブルク家の拠点。", ["danube", "buda"]);
city("buda", "ブダ", 19.04, 47.5, ["ブダペスト", "ハンガリー"], "ドナウ川沿い。ハンガリーの中心地。", ["danube", "vienna"]);
city("mohacs", "モハーチ", 18.68, 45.99, [], "ハンガリー南部、ドナウ川西岸。", ["buda", "danube"]);
city("preveza", "プレヴェザ", 20.75, 38.96, [], "ギリシア西岸、イオニア海。海戦の位置は概略。", ["mediterranean", "istanbul"]);
city("lepanto", "レパント", 21.83, 38.39, [], "ギリシア西部、コリント湾入口付近。海戦の位置は概略。", ["mediterranean", "istanbul"]);
city("karlowitz", "カルロヴィッツ", 19.93, 45.2, [], "現在のセルビア、ドナウ川沿い。", ["danube", "buda"]);
city("algiers", "アルジェ", 3.06, 36.75, ["アルジェリア", "バルバロス"], "北アフリカの地中海沿岸。", ["mediterranean", "tunis"]);
city("delhi", "デリー", 77.21, 28.61, ["アイバク", "クトゥブ＝ミナール", "クトゥブミナール"], "北インド、ヤムナー川沿い。", ["yamuna", "ganges", "agra"]);
city("agra", "アグラ", 78.01, 27.18, ["タージ＝マハル", "タージマハル", "アグラ城", "アクバル", "シャー＝ジャハーン", "ジャハーンギール", "ムムターズ"], "ヤムナー川沿い。ムガル帝国の都の一つ。", ["delhi", "yamuna"]);
city("panipat", "パーニーパット", 76.96, 29.39, ["パニパット"], "デリーの北西。北インドへ入る要地。", ["delhi", "punjab"]);
city("lahore", "ラホール", 74.36, 31.55, ["ラーホール", "ナーナク"], "パンジャーブ地方の都市。", ["punjab", "indus"]);
city("fergana", "フェルガナ", 71.75, 40.38, ["バーブル"], "中央アジアの盆地。バーブルの出発点。", ["samarkand", "kabul", "delhi"]);
city("hyderabad", "ハイデラバード", 78.49, 17.39, ["アーサフ＝ジャー"], "デカン高原。ニザーム王国の拠点。", ["deccan"]);
city("pune", "プーナ", 73.86, 18.52, ["シヴァージー"], "インド西部。マラーター勢力の中心地域。", ["deccan"]);
city("lucknow", "ラクナウ", 80.95, 26.85, [], "ガンジス川中流域。アワドの中心都市の一つ。", ["ganges", "delhi"]);
city("mysore", "マイソール", 76.64, 12.3, [], "南インド内陸。", ["deccan"]);
city("timbuktu", "トンブクトゥ", -3, 16.77, ["マンサ＝ムーサ"], "ニジェール川の北、サハラ砂漠南縁の交易都市。", ["niger", "sahara"]);
city("gao", "ガオ", -0.04, 16.27, [], "ニジェール川中流、トンブクトゥの東。", ["niger", "timbuktu"]);
city("meroe", "メロエ", 33.72, 16.94, [], "ヌビア、ナイル川中流の東岸。", ["nile", "nubia"]);
city("aksum", "アクスム", 38.72, 14.13, [], "エチオピア北部の高原。紅海交易につながる。", ["red-sea", "nubia"]);
city("mogadishu", "モガディシュ", 45.32, 2.05, [], "アフリカ東岸、インド洋の交易都市。", ["indian-ocean"]);
city("malindi", "マリンディ", 40.12, -3.22, [], "現在のケニア沿岸。", ["indian-ocean"]);
city("mombasa", "モンバサ", 39.67, -4.04, [], "現在のケニア沿岸。", ["indian-ocean"]);
city("zanzibar", "ザンジバル", 39.2, -6.16, [], "アフリカ東岸の島。", ["indian-ocean"]);
city("kilwa", "キルワ", 39.52, -8.96, [], "現在のタンザニア沿岸。金の交易で栄えた。", ["indian-ocean", "zimbabwe"]);
city("zimbabwe", "大ジンバブエ", 30.93, -20.27, ["ジンバブエ"], "アフリカ南部の内陸。海岸の交易都市とは別の場所。", ["kilwa", "zambezi"]);
city("kumbi", "クンビ＝サレー", -7.97, 15.67, [], "西アフリカ、ガーナ王国の主要拠点とされる遺跡。", ["sahara", "niger"]);
city("njimi", "ンジミ周辺", 15.3, 14.1, [], "チャド湖の北東。カネム王国の初期の中心域の目安。", ["chad"]);

region("anatolia", "アナトリア地方", 34.5, 39, [26,36,44,42], ["小アジア", "アナトリア"], "黒海の南、地中海の北。バルカン半島とは海峡を隔てる。");
region("khorasan", "ホラーサーン地方", 60, 36, [56,33,65,39], ["ホラーサーン", "ホラサン"], "イラン北東部からアフガニスタン西部。ホラズムより南。");
region("khwarazm", "ホラズム地方", 60, 41.8, [57,40,62,44], ["ホラズム地方"], "アラル海南側、アム川下流。ホラーサーンより北。");
region("transoxiana", "マー＝ワラー＝アンナフル", 66, 40.2, [62,38,70,42.5], ["トランスオクシアナ"], "アム川とシル川の間の中央アジアの地域。");
region("central-asia", "中央アジア", 68, 42, [57,37,79,47], ["トルキスタン"], "イラン・アフガニスタンの北、天山山脈周辺まで。");
region("mongolia", "モンゴル高原", 103, 46, [92,42,114,50], ["ウイグル", "モンゴル高原", "モンゴル帝国"], "中央アジアの東方。トルコ系・モンゴル系勢力の出発地。");
region("iran", "イラン高原", 53, 32.5, [45,26,62,39], ["イラン", "ペルシア"], "メソポタミアの東、カスピ海の南。");
region("iraq", "イラク", 44, 33, [41,29,49,37], ["メソポタミア", "南イラク"], "ティグリス川とユーフラテス川の流域。");
region("syria", "シリア", 37, 35, [35,32,41,37], [], "地中海東岸とメソポタミアの間。");
region("arabia", "アラビア半島", 44, 23, [35,13,56,30], ["ベドウィン", "アラブ人", "イエメン"], "紅海の東、ペルシア湾の南西。");
region("hijaz", "ヒジャーズ地方", 39.7, 23, [37,20,42,28], ["ヒジャーズ"], "アラビア半島西部。メッカとメディナを含む。");
region("egypt", "エジプト", 30, 27, [25,22,35,31.5], [], "ナイル川下流。地中海と紅海を結ぶ位置。");
region("nubia", "ヌビア", 32, 19, [29,15,35,23], [], "エジプトの南、ナイル川中流。");
region("ethiopia", "エチオピア", 39, 11, [35,6,43,15], [], "紅海の南西、高原地帯。");
region("maghrib", "マグリブ地方", 1, 32.5, [-10,29,12,37], ["マグリブ", "北アフリカ", "モロッコ", "ベルベル人"], "北アフリカ西部。地中海を隔ててイベリア半島と向かい合う。");
region("sahara", "サハラ砂漠", 4, 23, [-13,17,27,30], ["サハラ"], "地中海沿岸と西アフリカの間に広がる砂漠。");
region("iberia", "イベリア半島", -4, 40, [-9,36,3,44], ["イベリア", "スペイン", "カスティリャ", "アラゴン", "レコンキスタ"], "北アフリカの北、ジブラルタル海峡を隔てる。");
region("france", "フランス", 2, 47, [-3,43,7,50], ["フランソワ1世", "フランク王国"], "イベリア半島の北東。");
region("balkans", "バルカン半島", 23, 42, [18,37,29,46], ["バルカン", "セルビア"], "アナトリアの北西、ヨーロッパ側。");
region("caucasus", "カフカス地方", 45, 41.5, [40,38,50,44], ["コーカサス", "カフカス", "アルメニア", "グルジア", "アゼルバイジャン"], "黒海とカスピ海の間。");
region("crimea", "クリミア半島", 34.1, 45, [32,44,36.5,46], ["クリミア"], "黒海北岸。");
region("afghanistan", "アフガニスタン", 67, 34, [61,29,72,38], ["アフガン"], "イランの東、インドへ向かう山岳地帯。");
region("punjab", "パンジャーブ地方", 74, 31, [71,28,77,34], ["パンジャーブ", "シク教", "シク教徒", "ナーナク"], "インダス川の支流が流れる北西インドの地域。");
region("north-india", "北インド", 79, 28, [73,24,88,32], ["北インド", "ラージプート", "クシャトリヤ"], "ヒンドゥスターン平原。デリー・アグラなどが位置する。");
region("deccan", "デカン高原", 77, 18.5, [73,12,81,22], ["デカン", "マラーター", "シヴァージー"], "インド半島中南部。北インドの平原より南。");
region("india", "インド", 78, 23, [69,8,89,33], ["ヒンドゥー", "バクティ", "カビール", "ヴィシュヌ"], "インド洋へ突き出す亜大陸。");
region("china", "中国", 107, 34, [95,23,119,43], ["中国", "唐"], "中央アジアより東。地図では中国の西〜中部を示す。");
region("mediterranean", "地中海", 18, 35, [0,31,34,39], ["地中海"], "ヨーロッパと北アフリカの間の海。");
region("red-sea", "紅海", 37.5, 21.5, [33,13,43,29], ["紅海"], "アフリカとアラビア半島の間の海。");
region("persian-gulf", "ペルシア湾", 51.5, 27, [47,24,57,30], ["ペルシア湾"], "イランとアラビア半島の間。ホルムズ海峡でインド洋へつながる。");
region("black-sea", "黒海", 34, 44, [28,41,41,47], ["黒海"], "アナトリアの北。ボスポラス海峡から地中海へつながる。");
region("caspian-sea", "カスピ海", 51, 41, [47,37,55,46], ["カスピ海", "ダイラム"], "イランの北。ホラズム地方はこの東方。");
region("aral", "アラル海", 60, 45, [58,43,62,47], ["アラル海"], "アム川・シル川が流れ込んだ内陸湖。湖岸は時代により変化する。");
region("chad", "チャド湖", 14.5, 13, [13,12,15.5,14.5], ["チャド湖"], "サハラ砂漠南縁。カネム・ボルヌの中心地域。");
region("indian-ocean", "インド洋", 61, 6, [43,-12,81,18], ["インド洋", "スワヒリ", "アフリカ東岸"], "アフリカ東岸・アラビア半島・インドを結ぶ交易の海。");

polity("rashidun", "正統カリフ政権", "medina", "7世紀", ["正統カリフ", "ウマル", "アブー＝バクル"], ["kufa", "mecca"]);
polity("umayyad", "ウマイヤ朝", "damascus", "7〜8世紀", [], ["syria"]);
polity("abbasid", "アッバース朝", "baghdad", "8〜13世紀", ["アッバース革命", "サッファーフ", "アブー＝アル＝アッバース"], ["khorasan"]);
polity("cordoba-state", "後ウマイヤ朝", "cordoba", "8〜11世紀", ["西カリフ国"], ["iberia"]);
polity("fatimid", "ファーティマ朝", "cairo", "10〜12世紀・カイロへの遷都後", [], ["tunis", "egypt"]);
polity("aghlabid", "アグラブ朝", "kairouan", "9〜10世紀", [], ["maghrib"]);
polity("idrisid", "イドリース朝", "fes", "8〜10世紀", [], ["maghrib"]);
polity("tahirid", "ターヒル朝", "nishapur", "9世紀", [], ["khorasan"]);
polity("saffarid", "サッファール朝", "zaranj", "9〜11世紀", ["ヤークーブ"], ["khorasan"]);
polity("samanid", "サーマーン朝", "bukhara", "9〜10世紀", [], ["transoxiana"]);
polity("buyid", "ブワイフ朝", "baghdad", "10〜11世紀・イラク支配の拠点", [], ["iran", "caspian-sea"]);
polity("seljuq", "セルジューク朝", "isfahan", "11〜12世紀・最盛期の都", ["マリク＝シャー", "トゥグリル＝ベク", "トゥグリル＝ベグ", "ニザーム＝アル＝ムルク", "統治の書"], ["khorasan", "baghdad"]);
polity("rum", "ルーム＝セルジューク朝", "konya", "11〜14世紀", ["ルームセルジューク朝"], ["anatolia"]);
polity("khwarazm-state", "ホラズム＝シャー朝", "urgench", "11〜13世紀", ["ホラズム朝", "ホラズムシャー朝"], ["khwarazm", "khorasan", "amu"]);
polity("karakhanid", "カラ＝ハン朝", "balasagun", "10〜12世紀・主要拠点の一つ", ["カラハン朝"], ["kashgar", "bukhara"]);
polity("karakhitai", "カラ＝キタイ", "balasagun", "12〜13世紀", ["カラキタイ", "西遼"], ["central-asia"]);
polity("ghaznavid", "ガズナ朝", "ghazni", "10〜12世紀", [], ["afghanistan", "north-india"]);
polity("ghurid", "ゴール朝", "ghor", "12〜13世紀", [], ["ghazni", "delhi"]);
polity("zengid", "ザンギー朝", "mosul", "12〜13世紀", [], ["syria"]);
polity("almoravid", "ムラービト朝", "marrakech", "11〜12世紀", [], ["maghrib", "iberia", "sahara"]);
polity("almohad", "ムワッヒド朝", "marrakech", "12〜13世紀", [], ["maghrib", "iberia"]);
polity("nasrid", "ナスル朝", "granada", "13〜15世紀", [], ["iberia"]);
polity("ayyubid", "アイユーブ朝", "cairo", "12〜13世紀", ["サラディン", "サラーフ＝アッディーン"], ["syria", "jerusalem"]);
polity("mamluk", "マムルーク朝", "cairo", "13〜16世紀", [], ["egypt", "syria"]);
polity("slave", "奴隷王朝", "delhi", "13世紀", [], ["north-india"]);
polity("tughlaq", "トゥグルク朝", "delhi", "14〜15世紀", [], ["north-india"]);
polity("lodi", "ロディー朝", "delhi", "15〜16世紀", [], ["north-india"]);
polity("ilkhan", "イル＝ハン国", "tabriz", "13〜14世紀", ["イルハン国", "フレグ"], ["iran", "maragha"]);
polity("chagatai", "チャガタイ＝ハン国", "balasagun", "13〜14世紀・中心域の目安", [], ["central-asia"]);
polity("timurid", "ティムール朝", "samarkand", "14〜16世紀・ティムール期の都", ["ティムール"], ["herat", "central-asia"]);
polity("safavid", "サファヴィー朝", "isfahan", "16〜18世紀・後期の都", [], ["tabriz", "iran"]);
polity("afsharid", "アフシャール朝", "mashhad", "18世紀", [], ["iran", "khorasan"]);
polity("qajar", "カージャール朝", "tehran", "18〜20世紀", ["ガージャール朝"], ["iran"]);
polity("ottoman", "オスマン帝国", "istanbul", "15世紀後半以降の都", ["オスマン朝", "スレイマン1世", "セリム1世", "セリム2世", "イェニチェリ", "シパーヒー", "ティマール", "デヴシルメ", "ミッレト", "カーヌーン", "カピチュレーション", "徴税請負制", "バヤズィト", "ムラト2世", "メフメト1世", "チューリップ時代"], ["balkans", "anatolia"]);
polity("byzantine", "ビザンツ帝国", "istanbul", "4〜15世紀", ["東ローマ帝国", "ビザンツ"], ["anatolia", "balkans"]);
polity("sasanian", "ササン朝", "ctesiphon", "3〜7世紀", [], ["iran"]);
polity("mughal", "ムガル帝国", "delhi", "16〜19世紀・都の一つ", ["ムガル", "フマーユーン", "アウラングゼーブ", "マンサブ", "ジャーギール", "ザミンダール", "ディーネ＝イラーヒー", "アクバル＝ナーマ", "アブル＝ファズル"], ["agra", "north-india"]);
polity("sur", "スール朝", "delhi", "16世紀", [], ["north-india"]);
polity("maratha", "マラーター王国", "pune", "17〜18世紀・勢力の中心地域", ["マラーター同盟"], ["deccan"]);
polity("nizam", "ニザーム王国", "hyderabad", "18世紀以降", ["ハイデラバード王国"], ["deccan"]);
polity("awadh", "アワド王国", "lucknow", "18〜19世紀・後期の都", ["アウド王国"], ["ganges"]);
polity("sikh", "シク王国", "lahore", "19世紀", ["シク教王国"], ["punjab"]);
polity("mysore-state", "マイソール王国", "mysore", "南インドの王国", [], ["deccan"]);
polity("kush", "クシュ王国", "meroe", "古代・メロエ期の中心地", ["メロエ王国"], ["nubia", "nile", "egypt"]);
polity("aksum-state", "アクスム王国", "aksum", "古代", [], ["ethiopia", "red-sea"]);
polity("ghana", "ガーナ王国", "kumbi", "中世西アフリカ", [], ["sahara"]);
polity("mali", "マリ王国", "timbuktu", "13〜16世紀・主要交易都市（首都ではない）", [], ["niger", "sahara"]);
polity("songhai", "ソンガイ王国", "gao", "15〜16世紀", [], ["niger", "timbuktu"]);
polity("kanem", "カネム＝ボルヌ王国", "njimi", "中世以降・チャド湖周辺の中心域", ["カネム", "ボルヌ"], ["chad"]);
polity("mutapa", "モノモタパ王国", "zimbabwe", "15世紀以降・この印の北方に中心域", ["モノモタパ"], ["zambezi", "kilwa"]);
// モノモタパと大ジンバブエを同一の都として表示しない。
Object.assign(atlas.find(p => p.id === "mutapa"), { point: [31, -16.5], note: "15世紀以降。大ジンバブエより北、ザンベジ川南側の中心域の目安。" });
city("kandahar", "カンダハール", 65.71, 31.63, ["アフマド＝シャー"], "アフガニスタン南部。", ["afghanistan", "kabul"]);
polity("durrani", "ドゥッラーニー朝", "kandahar", "18〜19世紀・初期の都", ["ドゥッラーニー"], ["afghanistan"]);
polity("shaybanid", "シャイバーン朝", "bukhara", "16世紀", ["シャイバーニー", "シャイバニ", "ウズベク人"], ["samarkand", "central-asia"]);
region("kazakh", "カザフ＝ハン国の中心域", 72, 45.5, [65,43,79,49], ["カザフ＝ハン国", "カザフ人"], "15世紀以降。中央アジアのオアシス地域より北の草原地帯。");
region("russia", "モスクワ周辺", 37.6, 54, [33,51,42,55], ["モスクワ", "ロシア"], "黒海・カスピ海の北方。モスクワ市はこの地図の北端よりさらに北。");
polity("visigoth", "西ゴート王国", "toledo", "6〜8世紀の都", ["西ゴート"], ["iberia"]);
atlas.find(p => p.id === "iberia").aliases.push("スペイン王国", "カルロス1世", "フィリペ2世");
atlas.find(p => p.id === "vienna").aliases.push("ハプスブルク家", "カール5世", "オーストリア");
city("khiva", "ヒヴァ", 60.36, 41.38, ["ヒヴァ＝ハン国", "ヒバ＝ハン国"], "ホラズム地方。ヒヴァ＝ハン国の後期の都。", ["khwarazm", "amu"]);
city("kokand", "コーカンド", 70.94, 40.53, ["コーカンド＝ハン国"], "フェルガナ盆地。コーカンド＝ハン国の都。", ["fergana", "bukhara"]);
polity("bukhara-state", "ブハラ＝ハン国", "bukhara", "16〜20世紀（後期はアミール国）", [], ["khiva", "kokand"]);
city("saray", "サライ", 47.5, 47.18, ["サライ＝バトゥ"], "ヴォルガ川下流。サライの位置は概略。", ["caspian-sea"]);
polity("jochi", "ジョチ＝ウルス", "saray", "13〜15世紀", ["ジョチ＝ハン国", "キプチャク＝ハン国"], ["caspian-sea", "crimea"]);
city("bakhchisaray", "バフチサライ", 33.86, 44.75, [], "クリミア半島南西部。クリミア＝ハン国の後期の都。", ["crimea", "black-sea"]);
polity("crimean-state", "クリミア＝ハン国", "bakhchisaray", "15〜18世紀・16世紀以降の都", [], ["black-sea"]);
city("athens", "アテネ", 23.73, 37.98, ["ギリシア"], "ギリシアの都市。古代ギリシア文化の代表的な拠点。", ["mediterranean"]);
city("venice", "ヴェネツィア", 12.34, 45.44, ["ヴェネチア"], "アドリア海北岸の海港都市。", ["mediterranean"]);
city("rome", "ローマ", 12.5, 41.9, ["教皇"], "イタリア半島中部。教皇の拠点。", ["mediterranean"]);
city("lisbon", "リスボン", -9.14, 38.72, ["ポルトガル"], "イベリア半島西岸。ポルトガルの都。", ["iberia"]);
city("london", "ロンドン", -.13, 51.51, ["イギリス"], "ブリテン島南東部。イングランドの都。", ["france"]);
region("cyprus", "キプロス島", 33.2, 35, [32.2,34.5,34.6,35.7], ["キプロス"], "地中海東部、アナトリアの南方。");
atlas.find(p => p.id === "mughal").aliases.push("マンサブダール");
atlas.find(p => p.id === "ghurid").aliases.push("ムハンマド＝ゴーリー");

const river = (id, name, points, labelPoint, aliases = []) => {
  add(id, name, labelPoint, "river", aliases, "青い線は流路の概略。細かな蛇行や支流は省略。", []);
  atlas.at(-1).line = points;
};
river("tigris", "ティグリス川", [[39.3,38.3],[40.2,37.8],[42,37.3],[43.1,36.3],[43.7,34.9],[44.37,33.32],[45.2,32.5],[46.3,31.8],[47.4,31],[47.8,30.5]], [43.7,35], ["チグリス川"]);
river("euphrates", "ユーフラテス川", [[39,39],[38.5,38.5],[38,37.4],[38.2,36.6],[39.1,35.9],[40.2,35.3],[41,34.5],[43.3,33.4],[44.4,32],[45.5,31.2],[47.4,31]], [40.4,35.1]);
river("nile", "ナイル川", [[32.5,10],[32.5,13],[32.5,15.6],[33.7,17],[34,18],[32,19],[30.5,19.2],[30.5,20],[31.3,22],[32.9,24.1],[32.6,25.7],[31.1,27],[31.2,30],[30.4,31.4]], [32.4,24.5]);
river("amu", "アム川", [[73,37],[71,37.1],[69.4,37.4],[68,37.1],[66.8,37.6],[65,38.3],[63,39.2],[62,40],[60.5,41],[59.7,42],[59.5,43.5],[59.7,44.5]], [63.8,39], ["アムダリヤ"]);
river("syr", "シル川", [[74,41.5],[72,41],[70.5,40.5],[69,40.3],[68.5,41.5],[67.8,42.5],[66,44],[64,44.8],[62,45.5],[61,46]], [66,43.6], ["シルダリヤ"]);
river("indus", "インダス川", [[80,32],[77,34],[75,35.3],[73,35.7],[72,34.5],[71.7,33],[71.2,31],[70.5,29],[68.8,27.7],[68.4,25.5],[67.4,24]], [70.8,29.8]);
river("ganges", "ガンジス川", [[79,31],[78.2,30],[78.4,28.5],[80.2,27],[81.8,25.4],[83,25.3],[85.1,25.6],[87.5,25],[89.5,24],[90.5,23],[90.7,22]], [83.8,25.5]);
river("yamuna", "ヤムナー川", [[78.4,31],[77.5,30],[77.2,28.6],[77.7,27.5],[78.01,27.18],[79.3,26.4],[80.5,25.9],[81.8,25.4]], [78.5,26.7]);
river("niger", "ニジェール川", [[-10.8,9.4],[-9,10.6],[-8,12.6],[-6,13.5],[-4,15.3],[-3,16],[-1,16.4],[0.2,15],[2.1,13.5],[3.8,11],[4.7,8.6],[6,7],[6.3,5.2]], [-2,15.8]);
river("danube", "ドナウ川", [[10,48],[13.4,48.6],[16.37,48.21],[17.1,48.1],[19.04,47.5],[18.7,46],[20.5,44.8],[22.5,44.7],[25,43.7],[27,44.1],[28,45.2],[29.5,45.2]], [23.5,44.2]);
river("zambezi", "ザンベジ川", [[24,16.5*-1],[25.9,-17.9],[28.5,-16.5],[31,-15.6],[33.6,-16],[36.5,-18.8]], [30,-16]);

export const byPlaceId = new Map(atlas.map(p => [p.id, p]));
export const chapterContext = {
  "deck-1": ["mecca", "medina", "arabia"], "deck-2": ["damascus", "baghdad", "khorasan"],
  "deck-3": ["baghdad", "khorasan", "khwarazm", "anatolia"], "deck-5": ["cairo", "maghrib", "north-india"],
  "deck-7": ["samarkand", "herat", "central-asia"], "deck-8": ["isfahan", "tabriz", "iran"],
  "deck-9": ["istanbul", "anatolia", "balkans"], "deck-12": ["delhi", "agra", "deccan"],
  "deck-13": ["baghdad", "iran", "cordoba"],
};

// 明示的な地域の比較や移動を優先する。番号は既存の問題番号に対応。
export const mapOverrides = {
  "8af8aa": ["khwarazm-state", "khwarazm", "khorasan", "amu", "aral"],
  "66789d": ["khorasan", "baghdad", "khwarazm", "iran"],
  "582436": ["khorasan", "nishapur", "baghdad", "iran"],
  "49f719": ["cordoba-state", "fatimid", "abbasid"],
  "f419e2": ["baghdad", "buyid", "seljuq", "iran", "khorasan"],
  "9b34d6": ["medina", "kufa", "euphrates"],
  "fd1618": ["baghdad", "tigris", "euphrates"],
  "d48e8f": ["central-asia", "khorasan", "anatolia"],
  "01b54b": ["samanid", "buyid", "safavid", "iran"],
  "c1f21f": ["talas", "balasagun", "central-asia", "china"],
  "e30f09": ["mongolia", "central-asia", "baghdad"],
  "935179": ["kush", "nubia", "nile", "egypt", "aksum"],
  "f51dac": ["aksum-state", "red-sea", "meroe", "ethiopia"],
  "b8c046": ["egypt", "ethiopia", "istanbul"],
  "4ff529": ["egypt", "ethiopia", "nile"],
  "cd49d2": ["istanbul", "isfahan", "agra"],
  "183e4f": ["india", "baghdad", "cordoba"],
  "64d2df": ["india", "baghdad"],
  "7cb227": ["damascus", "isfahan", "granada"],
  "53925d": ["cairo", "istanbul", "delhi"],
  "09b245": ["tigris", "euphrates", "nile", "arabia"],
  "6af0a1": ["bukhara-state", "khiva", "kokand", "amu", "syr"],
  "925586": ["khiva", "bukhara", "khwarazm", "amu"],
  "d25511": ["kokand", "bukhara", "fergana", "syr"],
  "780d02": ["cordoba", "baghdad", "france", "athens"],
  "ee8f4f": ["north-india", "india"],
  "dcd7c4": ["kufa", "medina", "euphrates"],
  "5376a0": ["bursa", "sogut", "byzantine"],
  "5ffb5e": ["edirne", "bursa", "balkans"],
  "dbc09c": ["edirne", "bursa", "anatolia", "balkans"],
  "9fcd4b": ["kosovo", "edirne", "balkans"],
  "3e8525": ["kosovo", "edirne", "balkans"],
  "1f505a": ["ankara", "edirne", "samarkand", "anatolia"],
  "dbe9ff": ["ankara", "edirne", "samarkand", "anatolia"],
  "435ea5": ["nicopolis", "edirne", "buda", "danube"],
  "2dcaa6": ["nicopolis", "edirne", "buda", "danube"],
  "57fbc2": ["nicopolis", "edirne", "buda", "danube"],
};

export function findMapPlaces(question, deckId) {
  const override = mapOverrides[question.id.slice(5, 11)];
  const scores = new Map();
  if (override) override.forEach((id, i) => scores.set(id, 1000 - i));
  else {
    for (const [field, weight] of [["answer", 100], ["prompt", 85], ["explanation", 18]]) {
      const text = normalizeMapName(question[field] ?? ""), used = [];
      const matches = atlas.flatMap(place => place.aliases.map(alias => ({ place, alias: normalizeMapName(alias) })))
        .filter(({ alias }) => alias.length >= 2 && text.includes(alias)).sort((a, b) => b.alias.length - a.alias.length);
      for (const { place, alias } of matches) {
        let from = 0;
        while (true) {
          const at = text.indexOf(alias, from); if (at < 0) break;
          from = at + alias.length;
          if (place.id === "rome" && text.slice(Math.max(0, at - 2), at) === "神聖") continue;
          if (place.id === "varna" && text.slice(from, from + 1) === "制") continue;
          if (used.some(([a, b]) => at >= a && from <= b)) continue;
          used.push([at, from]);
          scores.set(place.id, (scores.get(place.id) ?? 0) + weight + Math.min(alias.length, 12));
          break;
        }
      }
    }
  }
  const matched = [...scores].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const focus = (matched.length ? matched : chapterContext[deckId]).slice(0, 7);
  const context = [...new Set(focus.flatMap(id => byPlaceId.get(id).context))].filter(id => !focus.includes(id)).slice(0, 4);
  // 同じ座標の「王朝と都」は両方を一覧に残し、地図上では一つの印にまとめる。
  return { focus, context, fallback: !matched.length };
}
