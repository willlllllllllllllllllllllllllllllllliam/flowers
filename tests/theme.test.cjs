const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "js", "theme.js"),
  "utf8",
);

function harness({
  saved,
  storageBlocked = false,
  renderer = true,
  review = false,
  inFrame = review,
  marker = review,
  reviewTheme = "light",
} = {}) {
  const stored = new Map(saved === undefined ? [] : [["flowers:theme", saved]]);
  const attributes = new Map();
  const meta = new Map();
  const listeners = new Map();
  const root = {
    dataset: {},
    hasAttribute: (name) => marker && name === "data-review",
  };
  const notes = {
    to: "for you",
    from: "with love",
    messages: ["first", "newest"],
    seed: "flowers-v2:03:fixed-for-this-visit",
  };
  let replayCount = 0;
  const button = {
    setAttribute: (name, value) => attributes.set(name, value),
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const context = {
    document: {
      documentElement: root,
      getElementById: (id) => (id === "theme-toggle" ? button : null),
      querySelector: (selector) =>
        selector === 'meta[name="theme-color"]'
          ? { setAttribute: (name, value) => meta.set(name, value) }
          : null,
    },
    window: {
      localStorage: {
        getItem(key) {
          if (storageBlocked) throw new Error("Storage denied");
          return stored.get(key) ?? null;
        },
        setItem(key, value) {
          if (storageBlocked) throw new Error("Storage denied");
          stored.set(key, value);
        },
      },
      matchMedia() {
        assert.fail("The theme must not follow the OS preference.");
      },
      FlowersNotes: {
        getState() {
          assert.fail("The theme must not read or change the notes.");
        },
      },
      FlowersGarden: renderer
        ? {
            replay() {
              replayCount += 1;
            },
          }
        : undefined,
    },
  };
  context.window.parent = inFrame ? {} : context.window;
  if (review) context.window.FLOWERS_REVIEW = { theme: reviewTheme };
  vm.runInNewContext(source, context);
  return {
    root,
    attributes,
    meta,
    button,
    notes,
    stored,
    click: () => listeners.get("click")(),
    replays: () => replayCount,
  };
}

test("a first visit stays light without replay or an OS preference lookup", () => {
  const page = harness();
  assert.equal(page.root.dataset.theme, "light");
  assert.equal(page.attributes.get("aria-pressed"), "false");
  assert.equal(page.attributes.get("aria-label"), "Switch to night mode");
  assert.equal(page.replays(), 0);
  assert.equal(page.meta.get("content"), "#f8f7f2");
  assert.equal(page.stored.size, 0);
});

test("each toggle changes the accessible label and restarts the same garden once", () => {
  const page = harness();
  const notes = JSON.stringify(page.notes);
  page.click();
  assert.equal(page.root.dataset.theme, "dark");
  assert.equal(page.meta.get("content"), "#151515");
  assert.equal(page.attributes.get("aria-pressed"), "true");
  assert.equal(page.attributes.get("aria-label"), "Switch to day mode");
  assert.equal(page.button.title, "Switch to day mode");
  assert.equal(page.replays(), 1);
  assert.equal(page.stored.get("flowers:theme"), "dark");
  assert.equal(JSON.stringify(page.notes), notes);
  page.click();
  assert.equal(page.root.dataset.theme, "light");
  assert.equal(page.meta.get("content"), "#f8f7f2");
  assert.equal(page.attributes.get("aria-label"), "Switch to night mode");
  assert.equal(page.attributes.get("aria-pressed"), "false");
  assert.equal(page.replays(), 2);
  assert.equal(page.stored.get("flowers:theme"), "light");
  assert.deepEqual([...page.stored.keys()], ["flowers:theme"]);
  assert.equal(JSON.stringify(page.notes), notes);
});

test("a saved dark preference restores before the first draw without a startup replay", () => {
  const page = harness({ saved: "dark" });
  assert.equal(page.root.dataset.theme, "dark");
  assert.equal(page.meta.get("content"), "#151515");
  assert.equal(page.replays(), 0);
  page.click();
  assert.equal(page.root.dataset.theme, "light");
  assert.equal(page.replays(), 1);
});

test("saved light and invalid preferences use the light default without replay", () => {
  for (const saved of ["light", "unknown", ""]) {
    const page = harness({ saved });
    assert.equal(page.root.dataset.theme, "light");
    assert.equal(page.replays(), 0);
  }
});

test("blocked storage does not prevent either theme or animation replay", () => {
  const page = harness({ storageBlocked: true });
  assert.equal(page.root.dataset.theme, "light");
  page.click();
  assert.equal(page.root.dataset.theme, "dark");
  page.click();
  assert.equal(page.root.dataset.theme, "light");
  assert.equal(page.replays(), 2);
});

test("the theme remains usable if the renderer fails to load", () => {
  const page = harness({ renderer: false });
  page.click();
  assert.equal(page.root.dataset.theme, "dark");
  assert.equal(page.replays(), 0);
});

test("only the marked review iframe can override a theme without saving it", () => {
  const page = harness({ review: true, saved: "light", reviewTheme: "dark" });
  assert.equal(page.root.dataset.theme, "dark");
  page.click();
  page.click();
  assert.equal(page.stored.get("flowers:theme"), "light");
  for (const options of [{ inFrame: false }, { marker: false }]) {
    const normal = harness({
      review: true,
      saved: "light",
      reviewTheme: "dark",
      ...options,
    });
    assert.equal(normal.root.dataset.theme, "light");
    normal.click();
    assert.equal(normal.stored.get("flowers:theme"), "dark");
  }
});

test("the page loads the theme immediately before the garden renderer", () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );
  const scripts = Array.from(
    html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi),
    (match) => match[1],
  );
  const themeIndex = scripts.indexOf("js/theme.js");
  assert.ok(themeIndex >= 0);
  assert.ok(scripts.indexOf("js/garden.js") > themeIndex);
  assert.ok(scripts.indexOf("js/canvas-renderer.js") > themeIndex);
});
