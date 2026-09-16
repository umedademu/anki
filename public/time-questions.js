// 年号を答える問題だけを除外し、年号を手がかりに人物などを答える問題は残す。
export function isTimeQuestion(question) {
  if (!question || question.stage === "integrated" || question.type === "integrated") return false;
  if (question.type === "time") return true;
  const focus = String(question.focus ?? "");
  if (/^(時期|年代|年号|起こった時期)(?:$|[・、])/.test(focus)) return true;
  const prompt = String(question.prompt ?? "")
    .replace(/[（(][ぁ-ゖァ-ヺー・＝=\s]+[）)]/gu, "");
  if (/いつ(?:[?？、。]|から|まで|ごろ|頃|に|なの|です|起|始|終|成立|完成|設|建|制定|公布|施行)/u.test(prompt)) return true;
  // 任期・年齢・周期は「いつ起きたか」と異なる数量の問い。
  if (/任期|期間|年齢|何年間|何年ごと|何年周期/u.test(prompt)) return false;
  return /何(?:年|世紀|月|日)|どの時代/u.test(prompt);
}

export function hasTimeQuestions(terms) {
  return terms.some((term) => Object.values(term.stages ?? {}).flat().some(isTimeQuestion));
}

export function filterTimeQuestions(terms, exclude = true) {
  if (!exclude) return terms;
  return terms.flatMap((term) => {
    const stages = Object.fromEntries(Object.entries(term.stages ?? {}).map(
      ([stage, questions]) => [stage, stage === "integrated" ? questions : questions.filter((question) => !isTimeQuestion(question))],
    ));
    return Object.values(stages).some((questions) => questions.length) ? [{ ...term, stages }] : [];
  });
}
