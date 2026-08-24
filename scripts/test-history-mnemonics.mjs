import {
  answerContainsDate,
  createApprovedMnemonicPlan,
  eventMatchesTerm,
  extractMasterMnemonic,
  formatMasterMnemonic,
  formatWixMnemonic,
  parseMasterTitle,
  parseWixDateExpression,
  parseWixPageItems,
} from "./sync-approved-history-mnemonics.mjs";

const html = `
<div class="cap_box_ttl"><span>語呂合わせ</span></div><div class="cap_box_content">
<p class="wp-block-paragraph">鳴くよ（794）ウグイス、<ruby><rb>平安京</rb><rt>へいあんきょう</rt></ruby></p>`;

if (
  extractMasterMnemonic(html) !== "鳴くよ(794)ウグイス、平安京" ||
  JSON.stringify(parseMasterTitle("794年 平安京へ遷都")) !==
    JSON.stringify({ date: "794年", event: "平安京へ遷都" }) ||
  formatMasterMnemonic("794年", "鳴くよ（794）ウグイス、平安京") !==
    "794年：「鳴くよ」(794)ウグイス、平安京"
) {
  throw new Error("語呂合わせマスターの記事を正しく整形できませんでした。");
}

const wixHtml = `
<div class="wixui-rich-text" data-testid="richTextElement">
  <p>● １６５２ 年：二つの年を持つ出来事が始まる。</p>
  <p>☆ 始まりを覚える試験用の語呂</p>
</div>
<div class="wixui-rich-text" data-testid="richTextElement">
  <p>● １７０１ 年：二つの年を持つ出来事が終わる。</p>
  <p>☆ 終わりを覚える試験用の語呂</p>
</div>`;
const parsedWixItems = parseWixPageItems(wixHtml, {
  subjectId: "world-history",
  sourceId: "sekaishi-goro",
  url: "https://example.com/world-history",
});
if (
  parsedWixItems.length !== 2 ||
  JSON.stringify(parseWixDateExpression("BC264-BC146年")) !==
    JSON.stringify([
      { year: "264", beforeCommonEra: true, label: "前264年" },
      { year: "146", beforeCommonEra: true, label: "前146年" },
    ]) ||
  formatWixMnemonic(parsedWixItems[0]) !==
    "1652年：「始まりを覚える試験用の語呂」（1652）二つの年を持つ出来事が始まる。"
) {
  throw new Error("年代別語呂合わせサイトの記事を正しく整形できませんでした。");
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
  answerContainsDate("前27年〜後14年在位", "27年")
) {
  throw new Error("期間の各年を正しく照合できませんでした。");
}

const preferredCandidate = {
  sourceId: "goroawase-master",
  subjectId: "world-history",
  dates: [{ year: "1652", beforeCommonEra: false, label: "1652年" }],
  event: "二つの年を持つ出来事が始まる",
  eventDescription: "二つの年を持つ出来事が始まる",
  mnemonic: "二つの年を持つ出来事を覚える語呂",
  formattedMnemonic:
    "1652年：「二つの年を持つ出来事を覚える語呂」(1652)試験用",
  url: "https://example.com/preferred",
};
const plan = createApprovedMnemonicPlan(
  [...parsedWixItems, preferredCandidate],
  [
    {
      subjectId: "world-history",
      term: {
        id: "WH-000001",
        term: "二つの年を持つ出来事",
        aliases: [],
        stages: {
          beginner: [
            {
              id: "WH-000001-B02",
              stage: "beginner",
              answer: "1652〜1701年",
              yearMnemonic: "独自作成の削除対象",
            },
          ],
          reverse: [
            {
              id: "WH-000001-R01",
              stage: "reverse",
              answer: "1652〜1701年",
              yearMnemonic: "独自作成の削除対象",
            },
          ],
          integrated: [
            {
              id: "WH-000001-I01",
              stage: "integrated",
              answer: "1652年に始まり、1701年までに関連する出来事を説明する。",
              yearMnemonic: "独自作成の削除対象",
            },
          ],
        },
      },
    },
    {
      subjectId: "world-history",
      term: {
        id: "WH-000002",
        term: "掲載のない出来事",
        aliases: [],
        stages: {
          beginner: [
            {
              id: "WH-000002-B02",
              stage: "beginner",
              answer: "1900年",
              yearMnemonic: "独自作成の削除対象",
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
  plan.desiredByQuestionId.get("WH-000001-B02") !==
    [preferredCandidate.formattedMnemonic, parsedWixItems[1].formattedMnemonic].join("|") ||
  plan.desiredByQuestionId.get("WH-000001-R01") !==
    [preferredCandidate.formattedMnemonic, parsedWixItems[1].formattedMnemonic].join("|") ||
  plan.desiredByQuestionId.get("WH-000001-I01") !==
    [preferredCandidate.formattedMnemonic, parsedWixItems[1].formattedMnemonic].join("|") ||
  plan.desiredByQuestionId.get("WH-000002-B02") !== ""
) {
  throw new Error("期間の片端・両端と未掲載語呂を正しく処理できませんでした。");
}

console.log("許可済みサイト限定の年号語呂合わせ処理を確認しました。");
