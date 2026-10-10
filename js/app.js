/* Note validation, navigation, and the random garden seed.
   Authors only need to edit ../notes.js. */
(() => {
  "use strict";

  function readText(value, name, allowEmpty = false) {
    if (typeof value !== "string") throw new Error(`${name} must be text.`);
    const text = value.replace(/\r\n?/g, "\n");
    if (!allowEmpty && !text.trim())
      throw new Error(`${name} cannot be empty.`);
    return text;
  }

  function readNotes(value) {
    if (
      !value ||
      typeof value !== "object" ||
      !Array.isArray(value.messages) ||
      value.messages.length === 0
    ) {
      throw new Error("Add at least one note in notes.js.");
    }
    return {
      to: readText(value.to, "The recipient", true),
      from: readText(value.from, "The signature", true),
      messages: Array.from(value.messages, (message, index) =>
        readText(message, `Note ${index + 1}`),
      ),
    };
  }

  // Choose a garden for this visit. Avoid the previous garden when storage works.
  function createSeed() {
    const words = new Uint32Array(3);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(words);
    else
      for (let i = 0; i < words.length; i += 1)
        words[i] = Math.floor(Math.random() * 4294967296);
    let previous = null;
    try {
      const stored = Number(
        window.sessionStorage?.getItem("flowers:last-composition"),
      );
      if (Number.isInteger(stored) && stored >= 1 && stored <= 24)
        previous = stored;
    } catch {
      // Some browsers disable session storage for local files.
    }
    let number =
      1 + Math.floor((words[0] / 4294967296) * (previous === null ? 24 : 23));
    if (previous !== null && number >= previous) number += 1;
    try {
      window.sessionStorage?.setItem(
        "flowers:last-composition",
        String(number),
      );
    } catch {
      // A garden still works when the browser cannot store its number.
    }
    return `flowers-v2:${String(number).padStart(2, "0")}:${words[1].toString(36)}-${words[2].toString(36)}`;
  }

  // Only the developer review frame can use a fixed seed.
  function reviewSeed() {
    const value = window.FLOWERS_REVIEW?.seed;
    if (
      window.parent === window ||
      !document.documentElement.hasAttribute("data-review")
    )
      return null;
    return typeof value === "string" && value.length > 0 && value.length <= 128
      ? value
      : null;
  }

  let notes;
  let errorMessage = null;
  try {
    if (!window.FLOWERS_NOTES)
      throw new Error(
        "Could not load notes.js. Check the file name, quotation marks, and commas.",
      );
    notes = readNotes(window.FLOWERS_NOTES);
  } catch (error) {
    errorMessage = `${error.message} Save notes.js, then refresh this page.`;
    notes = { to: "", from: "", messages: [] };
  }
  const seed = reviewSeed() || createSeed();
  // The final array entry is the newest note.
  let currentIndex = notes.messages.length - 1;
  let initialized = false;
  let elements;
  let noteAnimation;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function getState() {
    return {
      to: notes.to,
      from: notes.from,
      messages: [...notes.messages],
      seed,
      error: errorMessage,
    };
  }

  function render(animate = false) {
    noteAnimation?.cancel();
    elements.to.textContent = notes.to;
    elements.to.hidden = !notes.to.trim();
    elements.text.textContent = notes.messages[currentIndex] || "";
    elements.error.hidden = !errorMessage;
    elements.error.textContent = errorMessage || "";
    elements.from.textContent = notes.from;
    elements.from.hidden = !notes.from.trim();
    elements.counter.textContent = `${String(currentIndex + 1).padStart(2, "0")} / ${String(notes.messages.length).padStart(2, "0")}`;
    elements.counter.setAttribute(
      "aria-label",
      `Note ${currentIndex + 1} of ${notes.messages.length}`,
    );
    elements.nav.hidden = notes.messages.length < 2;
    if (
      animate &&
      !reducedMotion.matches &&
      typeof elements.text.animate === "function"
    ) {
      noteAnimation = elements.text.animate(
        [
          { opacity: 0.2, transform: "translateY(2px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 220, easing: "ease-out" },
      );
    }
    window.dispatchEvent(
      new CustomEvent("flowers:notes", {
        detail: {
          ...getState(),
          index: currentIndex,
          count: notes.messages.length,
        },
      }),
    );
  }

  function changeNote(direction) {
    if (notes.messages.length < 2) return;
    currentIndex =
      (currentIndex + direction + notes.messages.length) %
      notes.messages.length;
    render(true);
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    const byId = (id) => document.getElementById(id);
    elements = {
      to: byId("note-to"),
      text: byId("note-text"),
      from: byId("note-from"),
      counter: byId("note-counter"),
      nav: byId("note-nav"),
      error: byId("note-error"),
    };
    byId("prev-note").addEventListener("click", () => changeNote(-1));
    byId("next-note").addEventListener("click", () => changeNote(1));
    document.addEventListener("keydown", (event) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest("input, textarea, select, [contenteditable]") ||
          target.isContentEditable)
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        changeNote(event.key === "ArrowLeft" ? -1 : 1);
      }
    });
    render();
  }

  window.FlowersNotes = Object.freeze({ getState });
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
