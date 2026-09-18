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
  // 章が増えても全パートを混ぜて保存できるようにする。従来の短い保存名は維持。
  if (datasetVersion.length > 100 && /^[A-Za-z0-9_-]+$/.test(subjectId) && sortedIds.every(id => /^[A-Za-z0-9_-]+$/.test(id))) {
    let hash = 14695981039346656037n;
    for (const character of JSON.stringify([subjectId, sortedIds])) {
      hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0))) * 1099511628211n);
    }
    datasetVersion = `mix-${subjectId}-selection-${hash.toString(16).padStart(16, "0")}`;
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
