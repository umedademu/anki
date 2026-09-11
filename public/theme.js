(() => {
  const storageKey = "anki-color-theme:v1";
  const root = document.documentElement;
  const normalize = (value) => value === "dark" ? "dark" : "light";
  const updateButtons = () => {
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      const dark = root.dataset.theme === "dark";
      button.textContent = dark ? "ライトモードへ" : "ダークモードへ";
      button.setAttribute("aria-label", dark ? "ライトモードに切り替える" : "ダークモードに切り替える");
      button.title = dark ? "現在はダークモードです" : "現在はライトモードです";
    }
  };
  const apply = (value) => {
    const theme = normalize(value);
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#121c17" : "#f3f5f0";
    updateButtons();
  };
  let initial = "light";
  try { initial = localStorage.getItem(storageKey); } catch { /* 保存できない環境でも切り替えを使える。 */ }
  // 本文を描画する前に保存済みの配色を適用する。
  apply(initial);
  document.addEventListener("DOMContentLoaded", updateButtons);
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-theme-toggle]")) return;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    apply(next);
    try { localStorage.setItem(storageKey, next); } catch { /* 今回の画面には反映済み。 */ }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null) apply(event.newValue);
  });
})();
