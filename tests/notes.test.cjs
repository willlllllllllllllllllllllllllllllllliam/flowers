"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { validateNotes } = require("../tools/stage.cjs");
const root = path.resolve(__dirname, "..");
const originalMessages = [
  "If you ask me, I bet they'd probably really like it if you do.",
  "This website is open source, and you can make your own version for a loved one.",
];

function fixture(
  notes,
  {
    review = false,
    inFrame = review,
    marker = review,
    stored,
    randomWord = 0,
    storageBlocked = false,
  } = {},
) {
  const elements = new Map(),
    listeners = new Map(),
    messages = [],
    events = [];
  const storage = new Map(
    stored === undefined ? [] : [["flowers:last-composition", String(stored)]],
  );
  class Element {
    constructor() {
      this.textContent = "";
      this.hidden = false;
      this.attributes = new Map();
      this.listeners = new Map();
    }
    set innerHTML(_) {
      throw new Error("Notes must use plain text.");
    }
    addEventListener(type, callback) {
      this.listeners.set(type, callback);
    }
    click() {
      this.listeners.get("click")?.({ target: this });
    }
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    closest() {
      return null;
    }
  }
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const window = {
    FLOWERS_NOTES: notes,
    FLOWERS_REVIEW: { seed: "flowers-v2:07:review" },
    matchMedia: () => ({ matches: true }),
    dispatchEvent: (event) => events.push(event),
    crypto: {
      getRandomValues(words) {
        words.fill(randomWord);
      },
    },
    sessionStorage: {
      getItem(key) {
        if (storageBlocked) throw new Error("Storage denied.");
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (storageBlocked) throw new Error("Storage denied.");
        storage.set(key, value);
      },
    },
  };
  window.parent = inFrame ? {} : window;
  if (!review) delete window.FLOWERS_REVIEW;
  const context = vm.createContext({
    window,
    Element,
    console: {
      warn: (text) => messages.push(text),
      error: (text) => messages.push(text),
    },
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    document: {
      readyState: "complete",
      documentElement: {
        hasAttribute: (name) => marker && name === "data-review",
      },
      addEventListener: (type, callback) => listeners.set(type, callback),
      getElementById: byId,
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/app.js"), "utf8"),
    context,
  );
  return {
    api: window.FlowersNotes,
    byId,
    listeners,
    messages,
    events,
    storage,
  };
}

test("editable notes.js contains valid notes and shows its newest message first", () => {
  const source = fs.readFileSync(path.join(root, "notes.js"), "utf8");
  validateNotes(source);
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context);
  const notes = JSON.parse(JSON.stringify(context.window.FLOWERS_NOTES));
  const h = fixture(notes);
  const normalize = (text) => text.replace(/\r\n?/g, "\n");
  assert.equal(h.api.getState().error, null);
  assert.equal(
    h.byId("note-text").textContent,
    normalize(notes.messages.at(-1)),
  );
  assert.equal(h.byId("note-to").textContent, normalize(notes.to));
  assert.equal(h.byId("note-from").textContent, normalize(notes.from));
  assert.equal(h.byId("note-nav").hidden, notes.messages.length < 2);
});

test("the newest note appears first and both arrows wrap without a new garden", () => {
  const h = fixture({ to: "", from: "", messages: originalMessages });
  assert.equal(h.byId("note-text").textContent, originalMessages[1]);
  assert.equal(h.byId("note-counter").textContent, "02 / 02");
  assert.equal(
    h.byId("note-counter").attributes.get("aria-label"),
    "Note 2 of 2",
  );
  assert.equal(h.byId("note-to").hidden, true);
  assert.equal(h.byId("note-from").hidden, true);
  assert.equal(h.byId("note-nav").hidden, false);
  assert.equal(h.byId("note-error").hidden, true);
  const seed = h.api.getState().seed;
  for (const button of ["next-note", "prev-note"]) {
    h.byId(button).click();
    assert.equal(h.byId("note-text").textContent, originalMessages[0]);
    h.byId(button).click();
    assert.equal(h.byId("note-text").textContent, originalMessages[1]);
  }
  assert.equal(h.api.getState().seed, seed);
  assert.deepEqual(
    h.events.map((event) => event.detail.index),
    [1, 0, 1, 0, 1],
  );
});

test("one note hides the arrows and retains literal Unicode, quotes, and line breaks", () => {
  const message = 'Café, 雨, and flowers. ♡\r\n"You" <b>matter</b>.';
  const h = fixture({ to: "Sam,", from: "Love, Alex", messages: [message] });
  assert.equal(h.byId("note-text").textContent, message.replace("\r\n", "\n"));
  assert.equal(h.byId("note-nav").hidden, true);
  assert.equal(h.byId("note-to").hidden, false);
  assert.equal(h.byId("note-from").hidden, false);
  assert.equal(h.byId("note-to").textContent, "Sam,");
  assert.equal(h.byId("note-from").textContent, "Love, Alex");
  h.byId("next-note").click();
  assert.equal(h.byId("note-text").textContent, message.replace("\r\n", "\n"));
});

test("missing or invalid notes expose a useful error without fallback messages", () => {
  for (const notes of [
    undefined,
    null,
    {},
    { to: "", from: "", messages: [] },
    { to: "", from: "", messages: [null] },
    { to: "", from: "", messages: [" "] },
    { to: 5, from: "", messages: ["Valid text."] },
  ]) {
    const h = fixture(notes);
    assert.equal(h.byId("note-error").hidden, false);
    assert.match(h.byId("note-error").textContent, /notes\.js/i);
    assert.equal(h.byId("note-text").textContent, "");
    assert.equal(h.byId("note-nav").hidden, true);
    assert.equal(typeof h.api.getState().error, "string");
    assert.ok(
      !originalMessages.some((note) =>
        h.byId("note-text").textContent.includes(note),
      ),
    );
  }
});

test("all 24 gardens can appear and a normal revisit avoids the last garden", () => {
  const notes = { to: "", from: "", messages: ["Note."] };
  const selected = new Set();
  for (let index = 0; index < 24; index++) {
    const h = fixture(notes, {
      randomWord: Math.floor(((index + 0.5) / 24) * 4294967296),
    });
    const number = Number(h.api.getState().seed.split(":")[1]);
    selected.add(number);
    assert.equal(Number(h.storage.get("flowers:last-composition")), number);
  }
  assert.equal(selected.size, 24);
  for (let last = 1; last <= 24; last++) {
    for (const randomWord of [0, 2147483648, 4294967295]) {
      assert.notEqual(
        Number(
          fixture(notes, { stored: last, randomWord })
            .api.getState()
            .seed.split(":")[1],
        ),
        last,
      );
    }
  }
  assert.match(
    fixture(notes, { storageBlocked: true }).api.getState().seed,
    /^flowers-v2:\d{2}:/,
  );
});

test("only a marked review iframe can choose a fixed garden", () => {
  const notes = { to: "", from: "", messages: ["Note."] };
  const seed = "flowers-v2:07:review";
  assert.equal(fixture(notes, { review: true }).api.getState().seed, seed);
  assert.notEqual(
    fixture(notes, { review: true, inFrame: false }).api.getState().seed,
    seed,
  );
  assert.notEqual(
    fixture(notes, { review: true, marker: false }).api.getState().seed,
    seed,
  );
});

test("the arrow keys change notes but ignore browser shortcuts and text fields", () => {
  const h = fixture({
    to: "",
    from: "",
    messages: ["First.", "Second.", "Third."],
  });
  const keydown = h.listeners.get("keydown");
  const event = { key: "ArrowLeft", target: {}, preventDefault() {} };
  keydown(event);
  assert.equal(h.byId("note-text").textContent, "Second.");
  keydown({ ...event, ctrlKey: true });
  keydown({ ...event, metaKey: true });
  keydown({ ...event, altKey: true });
  keydown({ ...event, defaultPrevented: true });
  assert.equal(h.byId("note-text").textContent, "Second.");
});
