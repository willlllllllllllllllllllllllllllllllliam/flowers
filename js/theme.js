/* The theme choice stays on this device. A switch redraws the same garden. */
(() => {
  "use strict";

  const root = document.documentElement;
  const button = document.getElementById("theme-toggle");
  if (!button) return;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const storageKey = "flowers:theme";
  const review =
    window.parent !== window && root.hasAttribute("data-review")
      ? window.FLOWERS_REVIEW
      : null;

  function applyTheme(theme, replay) {
    root.dataset.theme = theme;
    const dark = theme === "dark";
    const label = dark ? "Switch to day mode" : "Switch to night mode";
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("aria-label", label);
    button.title = label;
    themeColor?.setAttribute("content", dark ? "#151515" : "#f8f7f2");
    if (replay) window.FlowersGarden?.replay?.();
  }

  let initialTheme = "light";
  try {
    if (review) initialTheme = review.theme === "dark" ? "dark" : "light";
    else if (window.localStorage?.getItem(storageKey) === "dark")
      initialTheme = "dark";
  } catch {
    // The theme switch works when the browser blocks local storage.
  }
  applyTheme(initialTheme, false);

  button.addEventListener("click", () => {
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme, true);
    try {
      if (!review) window.localStorage?.setItem(storageKey, theme);
    } catch {
      // Keep the selected theme for this visit if the browser cannot save it.
    }
  });
})();
