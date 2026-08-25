export const ratingValues = Object.freeze(["again", "hard", "good", "easy"]);

const ratingCountLimit = 1_000_000_000;

export function createEmptyRatingCounts() {
  return {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  };
}

export function normalizeRatingCounts(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  return Object.fromEntries(
    ratingValues.map((rating) => [
      rating,
      Math.min(
        ratingCountLimit,
        Math.max(0, Number.parseInt(source[rating], 10) || 0),
      ),
    ]),
  );
}

export function addRatingCount(value, rating) {
  const counts = normalizeRatingCounts(value);
  if (!ratingValues.includes(rating)) return counts;
  return {
    ...counts,
    [rating]: Math.min(ratingCountLimit, counts[rating] + 1),
  };
}
