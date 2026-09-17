// URLには画面の場所だけを持たせ、問題の進行は保存済み記録から復元する。
export function readAppRoute(search) {
  const params = new URLSearchParams(search);
  const subject = params.get("subject") ?? "";
  return {
    subject,
    view: subject ? (["study", "input"].includes(params.get("view")) ? params.get("view") : "setup") : "home",
    decks: [...new Set(params.getAll("deck"))].filter(Boolean),
    mode: params.get("mode") === "listen-answer" ? "listen-answer" : "memorize",
    routine: params.get("routine") === "1",
  };
}

export function appRouteUrl(route) {
  if (!route.subject || route.view === "home") return "/";
  const params = new URLSearchParams({ subject: route.subject, view: route.view });
  if (route.view !== "input") {
    for (const deck of route.decks ?? []) params.append("deck", deck);
    if (route.view === "study") params.set("mode", route.mode ?? "memorize");
    if (route.routine) params.set("routine", "1");
  }
  return `/?${params}`;
}
