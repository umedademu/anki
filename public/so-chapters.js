// 保存する番号はパート単位。画面上では原文の章ごとにデッキをまとめる。
export function groupSODecks(decks, chapterGroups) {
  const definitions = chapterGroups?.length ? chapterGroups : [{
    id: "chapter-6", number: 6, title: "第6章 イスラーム世界", deckIds: decks.map(deck => deck.id),
  }];
  const byId = new Map(decks.map(deck => [deck.id, deck]));
  const seen = new Set();
  const groups = definitions.map(group => ({ ...group, decks: group.deckIds.flatMap(id => {
    if (!byId.has(id) || seen.has(id)) return [];
    seen.add(id); return [byId.get(id)];
  }) })).filter(group => group.decks.length).sort((a,b) => a.number - b.number);
  const remaining = decks.filter(deck => !seen.has(deck.id));
  if (remaining.length) groups.push({ id: "other", title: "その他の問題", number: 999, decks: remaining, deckIds: remaining.map(deck => deck.id) });
  return groups;
}

export function soStudyLabel(decks, chapterGroups) {
  const groups = groupSODecks(decks, chapterGroups);
  return groups.length === 1 ? groups[0].title : `${groups.length}デッキ`;
}
