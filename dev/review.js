/* This page uses the production files. It does not contain garden geometry. */
(() => {
  "use strict";

  const scenes = window.FlowersCompositions || [];
  const byId = (id) => document.getElementById(id);
  const siteRoot = new URL("../", location.href);
  const elements = {
    list: byId("scene-list"),
    viewport: byId("viewport"),
    scale: byId("scale"),
    fixture: byId("fixture"),
    greetings: byId("greetings"),
    theme: byId("theme"),
    motion: byId("motion"),
    timeline: byId("timeline"),
    timelineValue: byId("timeline-value"),
    title: byId("scene-title"),
    description: byId("scene-description"),
    status: byId("status"),
    stage: byId("stage"),
    wrap: byId("frame-wrap"),
    frame: byId("preview"),
    viewportMetric: byId("metric-viewport"),
    heartsMetric: byId("metric-hearts"),
    motionMetric: byId("metric-motion"),
    seedMetric: byId("metric-seed"),
  };
  const playbackControls = [...document.querySelectorAll("[data-playback]")];
  const fixtures = {
    long: {
      to: "",
      from: "",
      messages: [
        "A short note comes first.",
        "I wanted to leave you a few words for an ordinary day. I hope you find a little time to rest, a good reason to laugh, and something beautiful that you did not expect.\n\nThere are so many small things I want to remember: the light through the window, the walk home, and the stories we tell each other. They matter more because you are here.\n\nThis garden is a small reminder of that. You can come back whenever you like. I will keep adding to it as the days go by.",
      ],
    },
    unbroken: {
      to: "",
      from: "",
      messages: ["Averylongwordwithoutspaces".repeat(18)],
    },
  };

  let selected = 0;
  let source = "";
  let notesSource = "";
  let paused = false;
  let seekTime = null;
  let loadNumber = 0;
  let loadTimer = 0;
  let fallbackTimer = 0;
  const fallbackMessage =
    "Static SVG fallback: Canvas did not complete. The artwork remains visible, but the garden animation check did not pass.";

  function status(message, error = false) {
    elements.status.textContent = message;
    elements.status.dataset.error = String(error);
  }

  function engine() {
    return elements.frame.contentWindow?.FlowersGarden;
  }

  function playbackStatus(message) {
    const fallback = engine()?.getState().canvas?.fallback === "static-svg";
    status(fallback ? fallbackMessage : message, fallback);
  }

  function setControls(enabled) {
    const reduced = engine()?.getState().reducedMotion || false;
    for (const button of playbackControls) {
      button.disabled = !enabled || (reduced && button.id !== "replay");
    }
    elements.timeline.disabled = !enabled || reduced;
  }

  function resizeFrame() {
    const [width, height] = elements.viewport.value.split("x").map(Number);
    const style = getComputedStyle(elements.stage);
    const padding =
      parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const availableWidth = Math.max(
      100,
      elements.stage.clientWidth - padding - 2,
    );
    const availableHeight = Math.max(260, window.innerHeight - 340);
    const scale =
      elements.scale.value === "fit"
        ? Math.min(1, availableWidth / width, availableHeight / height)
        : Number(elements.scale.value);

    elements.frame.style.width = `${width}px`;
    elements.frame.style.height = `${height}px`;
    elements.frame.style.transform = `scale(${scale})`;
    elements.wrap.style.width = `${width * scale}px`;
    elements.wrap.style.height = `${height * scale}px`;
    elements.viewportMetric.textContent = `${width} × ${height} at ${Math.round(scale * 100)}%`;
  }

  function updateTime(milliseconds) {
    elements.timeline.value = String(Math.min(milliseconds, 300000));
    elements.timelineValue.textContent = `${(milliseconds / 1000).toFixed(1)} s`;
  }

  function updateMetrics() {
    const state = engine()?.getState();
    if (!state) return;

    elements.heartsMetric.textContent = `${state.hearts} hearts at this check`;
    elements.motionMetric.textContent =
      state.canvas?.fallback === "static-svg"
        ? "Static SVG fallback"
        : state.reducedMotion
          ? "Reduced motion"
          : state.paused
            ? "Paused"
            : "Animation active";
    elements.seedMetric.textContent = state.seed;
    byId("play").setAttribute(
      "aria-pressed",
      String(!state.paused && !state.reducedMotion),
    );
    byId("pause").setAttribute(
      "aria-pressed",
      String(state.paused && !state.reducedMotion),
    );
    updateTime(state.activeTime);
  }

  function reportError(error) {
    setControls(false);
    status(error instanceof Error ? error.message : String(error), true);
  }

  function seek(milliseconds) {
    const garden = engine();
    if (!garden?.reviewAt || garden.getState().reducedMotion) return;

    try {
      paused = true;
      seekTime = milliseconds;
      garden.reviewAt(milliseconds);
      updateMetrics();
      playbackStatus(
        `The animation pauses at ${(milliseconds / 1000).toFixed(1)} seconds. Play continues from this point.`,
      );
    } catch (error) {
      reportError(error);
    }
  }

  // A script must not contain an HTML closing tag when it enters srcdoc.
  function inlineScript(value) {
    return value.replace(/<\/script/gi, "<\\/script");
  }

  function makePreviewDocument(seed, request) {
    const parsed = new DOMParser().parseFromString(source, "text/html");
    parsed.documentElement.setAttribute("data-review", "");
    parsed.documentElement.dataset.theme = elements.theme.value;

    for (const oldBase of parsed.querySelectorAll("base")) oldBase.remove();
    const base = parsed.createElement("base");
    base.href = siteRoot.href;

    const hook = parsed.createElement("script");
    const config = {
      seed,
      still: elements.motion.value === "reduced",
      theme: elements.theme.value,
    };
    hook.textContent = inlineScript(`
      window.FLOWERS_REVIEW = ${JSON.stringify(config)};
      window.FLOWERS_REVIEW_LOAD = ${request};
      window.FLOWERS_REVIEW_ERRORS = [];
      function reportReviewError(message) {
        window.FLOWERS_REVIEW_ERRORS.push(message);
        parent.postMessage({ type: "flowers-review-error", request: ${request}, message }, ${JSON.stringify(location.origin)});
      }
      window.addEventListener("error", (event) => {
        const resource = event.target?.src || event.target?.href;
        const detail = resource
          ? "Could not load " + resource
          : (event.message || "Unknown script error") + (event.filename ? " at " + event.filename + ":" + event.lineno : "");
        reportReviewError(detail);
      }, true);
      window.addEventListener("unhandledrejection", (event) => {
        reportReviewError(String(event.reason?.message || event.reason || "Unknown promise error"));
      });
    `);
    parsed.head.prepend(base, hook);

    const fixture = fixtures[elements.fixture.value];
    const greetingMode = elements.greetings.value;
    if (fixture || greetingMode !== "current") {
      const notes = [...parsed.scripts].find((script) => {
        const path = script.getAttribute("src");
        return (
          path &&
          new URL(path, siteRoot).pathname ===
            new URL("notes.js", siteRoot).pathname
        );
      });
      if (!notes)
        throw new Error(
          "The production page does not load notes.js. The review cannot apply the note fixture.",
        );

      const replacement = parsed.createElement("script");
      let content = notesSource;
      if (fixture) {
        content += `\nwindow.FLOWERS_NOTES = { ...window.FLOWERS_NOTES, messages: ${JSON.stringify(fixture.messages)} };`;
      }
      if (greetingMode === "hidden") {
        content +=
          '\nwindow.FLOWERS_NOTES = { ...window.FLOWERS_NOTES, to: "", from: "" };';
      } else if (greetingMode === "named") {
        content +=
          '\nwindow.FLOWERS_NOTES = { ...window.FLOWERS_NOTES, to: "Alex,", from: "Love, Sam" };';
      }
      replacement.textContent = inlineScript(content);
      notes.replaceWith(replacement);
    }

    return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
  }

  function showScene(index) {
    if (!source || !scenes.length) return;
    selected = (index + scenes.length) % scenes.length;
    const scene = scenes[selected];
    const number = String(scene.id).padStart(2, "0");
    const seed = `flowers-v2:${number}:review`;
    elements.title.textContent = `${number}. ${scene.name}`;
    elements.description.textContent = scene.description;

    for (const button of elements.list.querySelectorAll("button")) {
      const active = Number(button.dataset.index) === selected;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }

    setControls(false);
    status("Load the current production page.");
    loadNumber += 1;
    clearTimeout(loadTimer);
    clearTimeout(fallbackTimer);
    try {
      elements.frame.srcdoc = makePreviewDocument(seed, loadNumber);
      resizeFrame();
      loadTimer = window.setTimeout(() => {
        reportError(
          new Error(
            "The preview did not finish within 12 seconds. Check the local server and the browser console.",
          ),
        );
      }, 12000);
    } catch (error) {
      reportError(error);
    }
  }

  elements.frame.addEventListener("load", () => {
    const frameWindow = elements.frame.contentWindow;
    if (!source || frameWindow?.FLOWERS_REVIEW_LOAD !== loadNumber) return;
    clearTimeout(loadTimer);

    try {
      const errors = frameWindow.FLOWERS_REVIEW_ERRORS;
      if (errors?.length) throw new Error(errors.join(" | "));
      const noteError = frameWindow.FlowersNotes?.getState().error;
      if (noteError) throw new Error(noteError);
      const garden = engine();
      if (!garden?.reviewAt) {
        throw new Error(
          "The garden did not start with its review controls. Check notes.js and the browser console.",
        );
      }

      // Use the real theme control if a saved preference overrides the review.
      const root = elements.frame.contentDocument.documentElement;
      if (root.dataset.theme !== elements.theme.value) {
        elements.frame.contentDocument.getElementById("theme-toggle")?.click();
      }

      const reduced = garden.getState().reducedMotion;
      if (!reduced && seekTime !== null) garden.reviewAt(seekTime);
      else if (!reduced && paused) garden.pause();

      if (Number(garden.getState().composition) !== scenes[selected].id) {
        throw new Error(
          "The garden does not match the selected seed. Check the review gate in js/app.js.",
        );
      }

      setControls(true);
      updateMetrics();
      playbackStatus(
        reduced
          ? "Reduced motion shows a static garden. Time controls do not apply in this mode."
          : "The frame uses the current site files. Use the controls to inspect the animation.",
      );
      // Check once after the garden sequence for a later Canvas failure.
      const request = loadNumber;
      fallbackTimer = window.setTimeout(() => {
        if (request !== loadNumber || elements.status.dataset.error === "true")
          return;
        if (engine()?.getState().canvas?.fallback === "static-svg") {
          updateMetrics();
          playbackStatus(fallbackMessage);
        }
      }, 11000);
    } catch (error) {
      reportError(error);
    }
  });

  window.addEventListener("message", (event) => {
    if (
      event.source !== elements.frame.contentWindow ||
      event.origin !== location.origin
    )
      return;
    if (
      event.data?.type !== "flowers-review-error" ||
      event.data.request !== loadNumber
    )
      return;
    reportError(event.data.message);
  });

  byId("previous").addEventListener("click", () => showScene(selected - 1));
  byId("next").addEventListener("click", () => showScene(selected + 1));
  byId("play").addEventListener("click", () => {
    paused = false;
    seekTime = null;
    engine()?.resume();
    updateMetrics();
    playbackStatus("The animation continues from this point.");
  });
  byId("pause").addEventListener("click", () => {
    paused = true;
    engine()?.pause();
    seekTime = engine()?.getState().activeTime ?? null;
    updateMetrics();
    playbackStatus(
      "The animation pauses here. Play continues from this point.",
    );
  });
  byId("replay").addEventListener("click", () => {
    paused = false;
    seekTime = null;
    engine()?.replay();
    updateMetrics();
    playbackStatus("The same garden starts again.");
  });
  byId("garden-complete").addEventListener("click", () => seek(10500));
  byId("three-hearts").addEventListener("click", () => seek(20000));
  byId("all-hearts").addEventListener("click", () => seek(300000));
  elements.timeline.addEventListener("input", () =>
    updateTime(Number(elements.timeline.value)),
  );
  elements.timeline.addEventListener("change", () =>
    seek(Number(elements.timeline.value)),
  );

  for (const select of [
    elements.viewport,
    elements.fixture,
    elements.greetings,
  ]) {
    select.addEventListener("change", () => showScene(selected));
  }
  for (const select of [elements.theme, elements.motion]) {
    select.addEventListener("change", () => {
      paused = false;
      seekTime = null;
      showScene(selected);
    });
  }
  elements.scale.addEventListener("change", resizeFrame);
  window.addEventListener("resize", resizeFrame);

  for (const [index, scene] of scenes.entries()) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene";
    button.dataset.index = String(index);
    const number = document.createElement("span");
    number.textContent = String(scene.id).padStart(2, "0");
    const name = document.createElement("span");
    name.textContent = scene.name;
    button.append(number, name);
    button.addEventListener("click", () => showScene(index));
    item.append(button);
    elements.list.append(item);
  }

  async function readSiteFile(path) {
    const response = await fetch(new URL(path, siteRoot), {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Could not load ${path}: HTTP ${response.status}.`);
    return response.text();
  }

  async function initialize() {
    resizeFrame();
    if (location.protocol === "file:") {
      throw new Error(
        "This review page needs a local server. Run node tools/serve.cjs from the repository, then open its review URL.",
      );
    }
    if (scenes.length !== 24) {
      throw new Error(
        `Expected 24 gardens, but found ${scenes.length}. Check ../js/gardens.js.`,
      );
    }
    [source, notesSource] = await Promise.all([
      readSiteFile("index.html"),
      readSiteFile("notes.js"),
    ]);
    byId("previous").disabled = false;
    byId("next").disabled = false;
    showScene(0);
  }

  initialize().catch(reportError);
})();
