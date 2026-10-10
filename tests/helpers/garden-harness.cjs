const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const escape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function createHarness({
  width = 1440,
  height = 900,
  seed = "flowers-v2:01:review",
  reducedMotion = true,
  review = false,
  inFrame = review,
  reviewMarker = review,
  animationMode = "baseline",
  rendererSource,
  sources = {},
} = {}) {
  let now = 0;
  let nextTimer = 0;
  let nodeCount = 0;
  const timers = new Map();
  const animations = [];
  const listen = (target) => {
    target.listeners = new Map();
    target.addEventListener = (name, callback) => {
      if (!target.listeners.has(name)) target.listeners.set(name, []);
      target.listeners.get(name).push(callback);
    };
    target.dispatchEvent = (event) => {
      for (const callback of target.listeners.get(event.type) || [])
        callback(event);
    };
    return target;
  };
  const timeout = (callback, delay = 0) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: now + Math.max(0, Number(delay)) });
    return id;
  };
  const advance = (milliseconds) => {
    const target = now + milliseconds;
    let count = 0;
    while (true) {
      const pending = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      if (!pending.length) break;
      if (++count > 10000) throw new Error("Virtual timer limit exceeded.");
      const [id, timer] = pending[0];
      timers.delete(id);
      now = Math.max(now, timer.at);
      timer.callback();
    }
    now = target;
  };
  const motion = listen({ matches: reducedMotion });
  let document;
  let window;

  function dimensions() {
    const w = window?.innerWidth || width;
    const h = window?.innerHeight || height;
    const mobile = w <= 700;
    const short = !mobile && h <= 760;
    const longNote = document?.body.classList.contains("long-note") || false;
    const gardenHeight = Math.min(
      440,
      h * (mobile ? 0.31 : short ? 0.33 : 0.37),
    );
    const padding = longNote
      ? 125
      : mobile
        ? Math.max(140, Math.min(195, h * 0.21))
        : short
          ? 112
          : Math.max(134, Math.min(240, h * 0.21));
    const letterHeight = elements.letter.bounds?.height ?? padding + 285;
    const paperHeight = longNote
      ? Math.max(h, letterHeight + Math.max(340, h * 0.37 + 60))
      : Math.max(h, mobile ? 700 : short ? 660 : 760);
    const letterWidth = mobile
      ? w - (w <= 380 ? 48 : 64)
      : Math.min(560, w - 100);
    return {
      width: w,
      height: paperHeight,
      mobile,
      padding,
      letterWidth,
      gardenHeight,
      gardenTop: paperHeight - gardenHeight,
    };
  }

  class Element {
    constructor(tag, id = "") {
      if (++nodeCount > 50000) throw new Error("SVG node limit exceeded.");
      this.tagName = tag;
      this.attrs = new Map(id ? [["id", id]] : []);
      this.children = [];
      this.style = {};
      this.textContent = "";
      this.bounds = null;
      const classes = new Set();
      this.classList = {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle: (name, force = !classes.has(name)) => {
          if (force) classes.add(name);
          else classes.delete(name);
          return force;
        },
      };
      const dataName = (name) =>
        "data-" +
        String(name).replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
      this.dataset = new Proxy(
        {},
        {
          get: (_, name) => this.attrs.get(dataName(name)),
          set: (_, name, value) => {
            this.attrs.set(dataName(name), String(value));
            return true;
          },
        },
      );
      listen(this);
    }
    setAttribute(name, value) {
      this.attrs.set(name, String(value));
    }
    getAttribute(name) {
      return this.attrs.get(name) ?? null;
    }
    removeAttribute(name) {
      this.attrs.delete(name);
    }
    hasAttribute(name) {
      return this.attrs.has(name);
    }
    append(...nodes) {
      for (const child of nodes) {
        child.parentElement = this;
        this.children.push(child);
      }
    }
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    }
    querySelectorAll(selector) {
      const found = [];
      const visit = (element) => {
        for (const child of element.children) {
          if (
            selector.startsWith("[")
              ? child.attrs.has(selector.slice(1, -1))
              : child.tagName === selector
          )
            found.push(child);
          visit(child);
        }
      };
      visit(this);
      return found;
    }
    getBoundingClientRect() {
      const d = dimensions();
      let rect = { x: 0, y: 0, width: d.width, height: d.height };
      if (this.attrs.get("id") === "garden")
        rect = { x: 0, y: d.gardenTop, width: d.width, height: d.gardenHeight };
      if (this.attrs.get("id") === "letter")
        rect = {
          x: (d.width - d.letterWidth) / 2,
          y: 0,
          width: d.letterWidth,
          height: d.padding + 285,
        };
      if (this.bounds) rect = { ...rect, ...this.bounds };
      const left = rect.left ?? rect.x;
      const top = rect.top ?? rect.y;
      return {
        ...rect,
        x: left,
        y: top,
        left,
        top,
        right: rect.right ?? left + rect.width,
        bottom: rect.bottom ?? top + rect.height,
      };
    }
    animate(frames, options) {
      let state = "running";
      let start = now;
      let held = 0;
      const total = (options.delay || 0) + options.duration;
      const current = () => (state === "running" ? held + now - start : held);
      const animation = {
        frames,
        options,
        element: this,
        createdAt: now,
        get playState() {
          return state === "running" && current() >= total ? "finished" : state;
        },
        get currentTime() {
          return current();
        },
        set currentTime(value) {
          held = Number(value) || 0;
          start = now;
        },
        pause() {
          held = current();
          state = "paused";
        },
        play() {
          start = now;
          state = "running";
        },
        finish() {
          held = total;
          state = "finished";
        },
        cancel() {
          held = 0;
          state = "idle";
        },
      };
      animations.push(animation);
      return animation;
    }
  }

  const elements = Object.fromEntries(
    [
      ["garden", "svg", "garden"],
      ["hearts", "svg", "hearts"],
      ["paper", "main", "paper"],
      ["letter", "section", "letter"],
    ].map(([name, tag, id]) => [name, new Element(tag, id)]),
  );
  const byId = Object.fromEntries(
    Object.values(elements).map((element) => [
      element.getAttribute("id"),
      element,
    ]),
  );
  document = listen({
    hidden: false,
    body: new Element("body"),
    documentElement: new Element("html"),
    getElementById: (id) => byId[id],
    createElementNS: (_, tag) => new Element(tag),
    fonts: {
      ready: {
        then(callback) {
          callback();
        },
      },
    },
  });
  if (reviewMarker) document.documentElement.setAttribute("data-review", "");
  window = listen({
    innerWidth: width,
    innerHeight: height,
    FlowersNotes: { getState: () => ({ seed }) },
  });
  window.parent = inFrame ? {} : window;
  if (review) window.FLOWERS_REVIEW = { seed, animationMode };
  const context = vm.createContext({
    window,
    document,
    innerWidth: width,
    innerHeight: height,
    console,
    performance: { now: () => now },
    matchMedia: () => motion,
    getComputedStyle: () => ({ paddingTop: String(dimensions().padding) }),
    setTimeout: timeout,
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => timeout(() => callback(now), 16),
    cancelAnimationFrame: (id) => timers.delete(id),
  });
  for (const file of ["gardens.js", "garden.js"]) {
    const source =
      file === "garden.js" && rendererSource !== undefined
        ? rendererSource
        : (sources[file] ??
          fs.readFileSync(path.join(root, "js", file), "utf8"));
    vm.runInContext(source, context, { filename: file, timeout: 5000 });
  }

  const serialize = (element) => {
    const attributes = [...element.attrs]
      .map(([name, value]) => ` ${name}="${escape(value)}"`)
      .join("");
    const styles = Object.entries(element.style)
      .map(
        ([name, value]) =>
          `${name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())}:${value}`,
      )
      .join(";");
    return `<${element.tagName}${attributes}${styles ? ` style="${escape(styles)}"` : ""}>${escape(element.textContent)}${element.children.map(serialize).join("")}</${element.tagName}>`;
  };
  const geometry = () => serialize(elements.garden);
  return {
    window,
    document,
    elements,
    animations,
    geometry,
    clock: {
      advance,
      stall: (milliseconds) => {
        now += milliseconds;
      },
      now: () => now,
      pending: () => timers.size,
    },
    setHidden(hidden) {
      document.hidden = hidden;
      document.dispatchEvent({ type: "visibilitychange" });
    },
    setReducedMotion(value) {
      motion.matches = value;
      motion.dispatchEvent({ type: "change" });
    },
    resize(w, h) {
      window.innerWidth = w;
      window.innerHeight = h;
      context.innerWidth = w;
      context.innerHeight = h;
      window.dispatchEvent({ type: "resize" });
    },
  };
}

module.exports = { createHarness };
