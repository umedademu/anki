export function normalizeDeckSelection(
  availableDeckIds,
  selectedDeckIds,
  fallbackDeckId = "",
  aliases = {},
) {
  const selected = new Set((Array.isArray(selectedDeckIds) ? selectedDeckIds : [])
    .flatMap((id) => availableDeckIds.includes(id) ? [id] : aliases[id] ?? [id]));
  const normalized = availableDeckIds.filter((deckId) => selected.has(deckId));
  if (normalized.length > 0) return normalized;
  return availableDeckIds.includes(fallbackDeckId)
    ? [fallbackDeckId]
    : availableDeckIds.slice(0, 1);
}

export function createSessionDatasetVersion(
  subjectId,
  deckIds,
  datasetVersions,
) {
  if (deckIds.length === 1) {
    return datasetVersions.get(deckIds[0]) ?? "";
  }
  const sortedIds = [...deckIds].sort();
  let datasetVersion = `mix-${subjectId}-${sortedIds.join("-")}`;
  // 既存の保存先は維持し、長すぎる数値デッキの組合せだけ短縮する。
  if (datasetVersion.length > 100 && sortedIds.every((id) => /^deck-[1-9]\d*$/.test(id))) {
    datasetVersion = `mix-${subjectId}-decks-${sortedIds.map((id) => id.slice(5)).join("-")}`;
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(datasetVersion)) {
    throw new Error("選択したデッキの組合せが多すぎます。");
  }
  return datasetVersion;
}

export function mergeDeckProgress(cloudStates) {
  return {
    questions: Object.assign(
      {},
      ...cloudStates.map((cloudState) => cloudState.progress.questions),
    ),
    updatedAt: cloudStates
      .map((cloudState) => cloudState.progress.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
  };
}
