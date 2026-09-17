export const questionTypes = Object.freeze({
  identify: "用語の特定", time: "時期", place: "場所", person: "人物",
  actor: "主体", cause: "原因", content: "内容", result: "結果",
  relation: "関係", reverse: "逆向きの説明", integrated: "統合説明",
});

export function resolveQuestionTypes(value, excludeTimeQuestions = true) {
  return Array.isArray(value) ? value : Object.keys(questionTypes).filter(type => !excludeTimeQuestions || type !== "time");
}

export function filterQuestionTypes(terms, selected) {
  const allowed = new Set(selected);
  return terms.flatMap(term => {
    const stages = Object.fromEntries(Object.entries(term.stages ?? {}).map(
      ([stage, questions]) => [stage, questions.filter(question => allowed.has(question.type))],
    ));
    return Object.values(stages).some(questions => questions.length) ? [{ ...term, stages }] : [];
  });
}
