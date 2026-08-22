import {
  answerContainsDate,
  createReplacements,
  eventMatchesTerm,
  extractSiteMnemonic,
  formatPreferredMnemonic,
  mergePreferredMnemonic,
  parseSiteTitle,
} from "./sync-goroawase-master-mnemonics.mjs";

const html = `
<div class="cap_box_ttl"><span>語呂合わせ</span></div><div class="cap_box_content">
<p class="wp-block-paragraph">鳴くよ（794）ウグイス、<ruby><rb>平安京</rb><rt>へいあんきょう</rt></ruby></p>`;

if (
  extractSiteMnemonic(html) !== "鳴くよ（794）ウグイス、平安京" ||
  JSON.stringify(parseSiteTitle("794年 平安京へ遷都")) !==
    JSON.stringify({ date: "794年", event: "平安京へ遷都" }) ||
  formatPreferredMnemonic("794年", "鳴くよ（794）ウグイス、平安京") !==
    "794年：「鳴くよ」（794）ウグイス、平安京"
) {
  throw new Error("指定サイトから語呂合わせを正しく整形できませんでした。");
}

if (
  !eventMatchesTerm("平安京へ遷都", { term: "平安京", aliases: [] }) ||
  eventMatchesTerm("卑弥呼、魏に遣使", { term: "魏", aliases: [] })
) {
  throw new Error("出来事と用語の一致判定が正しくありません。");
}

if (
  !answerContainsDate("755〜763年", "755年") ||
  !answerContainsDate("前264〜前146年", "前146年") ||
  !answerContainsDate("（前146）", "前146年") ||
  answerContainsDate("前27年〜後14年在位", "27年") ||
  mergePreferredMnemonic(
    "755〜763年：「なごご」（755）から「なろみ」（763）までの安史の乱",
    "755年",
    "名ここ（755）に刻む、安史の乱",
  ) !==
    "755〜763年：「名ここ」（755）から「なろみ」（763）までの安史の乱" ||
  mergePreferredMnemonic(
    "418〜711年：「よいはじまり」（418〜711年）で覚える西ゴート王国",
    "418年",
    "良い輪（418）広げ、西ゴート王国の建国",
  ) !== ""
) {
  throw new Error("期間の端にある語呂だけを安全に改善できませんでした。");
}

const { replacements } = createReplacements(
  [
    {
      subjectId: "japanese-history",
      title: "794年 平安京へ遷都",
      mnemonic: "鳴くよ（794）ウグイス、平安京",
      url: "https://goroawase-master.com/794-heian-kyo/",
    },
  ],
  [
    {
      subjectId: "japanese-history",
      term: {
        id: "JH-000083",
        term: "平安京",
        aliases: [],
        stages: {
          beginner: [
            {
              id: "JH-000083-B02",
              answer: "794年",
              yearMnemonic: "794年：「鳴くよ」（794）うぐいす平安京",
            },
          ],
          reverse: [],
          integrated: [],
        },
      },
    },
  ],
);

if (
  replacements.length !== 1 ||
  replacements[0].termId !== "JH-000083" ||
  replacements[0].newMnemonic !==
    "794年：「鳴くよ」（794）ウグイス、平安京"
) {
  throw new Error("Cloudflare上の問題と指定サイトを照合できませんでした。");
}

const alreadyPreferred = createReplacements(
  [
    {
      subjectId: "japanese-history",
      title: "794年 平安京へ遷都",
      mnemonic: "鳴くよ（794）ウグイス、平安京",
      url: "https://goroawase-master.com/794-heian-kyo/",
    },
  ],
  [
    {
      subjectId: "japanese-history",
      term: {
        id: "JH-000083",
        term: "平安京",
        aliases: [],
        stages: {
          beginner: [
            {
              id: "JH-000083-B02",
              answer: "794年",
              yearMnemonic: "794年：「鳴くよ」（794）ウグイス、平安京",
            },
          ],
        },
      },
    },
  ],
);
if (
  alreadyPreferred.replacements.length !== 0 ||
  alreadyPreferred.matchedArticles.size !== 1 ||
  alreadyPreferred.matchedTerms.size !== 1
) {
  throw new Error("反映済みの一致件数を正しく確認できませんでした。");
}

console.log("年号語呂合わせの照合処理を確認しました。");
