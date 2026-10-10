const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createHarness } = require("./helpers/garden-harness.cjs");
const native = require("@napi-rs/canvas");

const source = fs.readFileSync(path.join(__dirname, "../js/garden.js"), "utf8");
const approved = fs.readFileSync(
  path.join(__dirname, "fixtures/v2-original-garden.js"),
  "utf8",
);
const modes = ["canvas", "baseline"];
const domAdapter = `
  const createHeartElement = document.createElementNS.bind(document);
  document.createElementNS = (...args) => {
    const element = createHeartElement(...args);
    element.removeAttribute = name => element.attrs.delete(name);
    return element;
  };
`;
const canvasAdapter = `
  window.FlowersCanvas = { create: () => ({
    prepare() {}, replay() {}, pause() {}, resume() {}, seek() {}, finish() {},
    getState: () => ({ backend: 'test-canvas' })
  }) };
`;

function fixture(mode, options = {}) {
  const { letterPaddingTop, letterBounds, ...harnessOptions } = options;
  const layoutAdapter =
    letterPaddingTop === undefined
      ? ""
      : `
    const readStyles = getComputedStyle;
    getComputedStyle = element => ({
      ...readStyles(element),
      ...(element === document.getElementById('letter') ? { paddingTop: ${JSON.stringify(String(letterPaddingTop))} } : {})
    });
    document.getElementById('letter').bounds = ${JSON.stringify(letterBounds || null)};
  `;
  const harness = createHarness({
    width: 1440,
    height: 1000,
    seed: "flowers-v2:07:heart-test",
    reducedMotion: false,
    review: true,
    ...harnessOptions,
    rendererSource:
      domAdapter +
      layoutAdapter +
      (mode === "canvas" ? canvasAdapter : "") +
      source,
  });
  const advance = harness.clock.advance;
  const dispatched = new Set();
  harness.clock.advance = (milliseconds) => {
    advance(milliseconds);
    // The shared DOM harness does not dispatch native Animation finish events.
    for (const animation of harness.animations) {
      if (
        animation.playState === "finished" &&
        animation.onfinish &&
        !dispatched.has(animation)
      ) {
        dispatched.add(animation);
        animation.onfinish();
      }
    }
  };
  harness.api = harness.window.FlowersGarden;
  return harness;
}

const fills = (harness) =>
  harness.elements.hearts.querySelectorAll("[data-heart-fill]");
const maskFor = (heart) => heart.querySelectorAll("mask")[0];
const isSolid = (fill) => fill.getAttribute("mask") === null;

test("the correction preserves existing hearts and permits extra hearts in clear space", () => {
  for (const id of ["01", "07", "17", "24"]) {
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
    ]) {
      const options = {
        width,
        height,
        seed: `flowers-v2:${id}:heart-fidelity`,
        reducedMotion: false,
        review: true,
      };
      const next = fixture("canvas", options),
        old = createHarness({ ...options, rendererSource: approved });
      next.api.reviewAt(600000);
      old.window.FlowersGarden.reviewAt(600000);
      const previous = old.elements.hearts.children,
        revised = next.elements.hearts.children;
      assert.ok(
        revised.length >= previous.length,
        `Garden ${id}, ${width} x ${height}: no existing heart disappears.`,
      );
      const byIndex = new Map(
        revised.map((heart) => [maskFor(heart).getAttribute("id"), heart]),
      );
      for (const before of previous) {
        const index = before.querySelectorAll("clipPath")[0].getAttribute("id");
        const after = byIndex.get(index);
        assert.ok(
          after,
          `Garden ${id}, ${width} x ${height}: ${index} stays present.`,
        );
        assert.equal(
          after.getAttribute("transform"),
          before.getAttribute("transform"),
        );
        assert.equal(
          after.querySelectorAll("[data-heart-fill]")[0].getAttribute("d"),
          before.children[0].getAttribute("d"),
        );
        assert.equal(
          maskFor(after).children[0].getAttribute("d"),
          before.children.at(-1).getAttribute("d"),
        );
      }
    }
  }
});

for (const mode of modes) {
  test(`${mode}: each heart reveals a real ink fill, then releases its mask`, () => {
    const h = fixture(mode);
    h.clock.advance(11999);
    assert.equal(fills(h).length, 0);
    h.clock.advance(1);
    assert.equal(fills(h).length, 1);
    const fill = fills(h)[0],
      heart = h.elements.hearts.children[0];
    const outline = heart.children.find(
      (el) => el.tagName === "path" && el.getAttribute("fill") === "none",
    );
    const mask = maskFor(heart),
      hatch = mask.children[0];
    assert.equal(fill.getAttribute("d"), outline.getAttribute("d"));
    assert.equal(fill.getAttribute("fill"), "var(--ink)");
    assert.equal(mask.getAttribute("mask-type"), "luminance");
    assert.equal(mask.getAttribute("maskUnits"), "userSpaceOnUse");
    assert.equal(mask.getAttribute("maskContentUnits"), "userSpaceOnUse");
    assert.equal(
      hatch.getAttribute("stroke"),
      "#fff",
      "The reveal stays white in both themes.",
    );
    assert.ok(Number(hatch.getAttribute("stroke-width")) >= 3);
    for (const name of ["x", "y", "width", "height"])
      assert.ok(Number.isFinite(Number(mask.getAttribute(name))));
    h.clock.advance(2299);
    assert.equal(isSolid(fill), false, "The mask lasts through the scribble.");
    h.clock.advance(1);
    assert.equal(
      isSolid(fill),
      true,
      "The completed heart has no mask reference.",
    );
    assert.equal(h.api.getState().completedEffects, 2);
  });

  test(`${mode}: a pause or hidden page cannot complete the mask early`, () => {
    const h = fixture(mode);
    h.clock.advance(13000);
    const fill = fills(h)[0];
    h.api.pause();
    h.clock.advance(60000);
    assert.equal(h.api.getState().activeTime, 13000);
    assert.equal(isSolid(fill), false);
    h.api.resume();
    h.clock.advance(1200);
    h.setHidden(true);
    h.clock.advance(60000);
    assert.equal(h.api.getState().activeTime, 14200);
    assert.equal(isSolid(fill), false);
    h.setHidden(false);
    h.clock.advance(100);
    assert.equal(isSolid(fill), true);
  });

  test(`${mode}: finish releases pending and active masks; replay resets the hearts`, () => {
    const h = fixture(mode);
    h.clock.advance(12000);
    h.api.finish();
    assert.ok(fills(h).every(isSolid));
    h.api.finish();
    assert.equal(
      h.api.getState().completedEffects,
      2,
      "Completion is idempotent.",
    );
    const before = h.geometry();
    h.api.replay();
    assert.equal(fills(h).length, 0);
    assert.equal(h.geometry(), before);
    h.clock.advance(12000);
    assert.ok(fills(h).every((fill) => !isSolid(fill)));
    h.clock.advance(1000);
    h.api.finish();
    assert.ok(fills(h).every(isSolid));
  });

  test(`${mode}: review seeks settle old hearts without timers or stale masks`, () => {
    const h = fixture(mode);
    h.api.reviewAt(12950);
    assert.equal(fills(h).length, 1);
    assert.ok(fills(h).every((fill) => !isSolid(fill)));
    assert.equal(h.clock.pending(), 0);
    h.api.reviewAt(14300);
    assert.ok(fills(h).every(isSolid));
    h.api.reviewAt(600000);
    assert.ok(fills(h).length > 0 && fills(h).length <= 7);
    assert.ok(fills(h).every(isSolid));
    assert.equal(h.clock.pending(), 0);
    h.api.reviewAt(13000);
    assert.ok(fills(h).every((fill) => !isSolid(fill)));
    h.api.resume();
    h.clock.advance(1300);
    assert.ok(fills(h).every(isSolid));
  });

  test(`${mode}: reduced motion renders solid hearts immediately without effect timers`, () => {
    const h = fixture(mode, { reducedMotion: true });
    assert.equal(fills(h).length, 3);
    assert.ok(fills(h).every(isSolid));
    assert.equal(h.clock.pending(), 0);
    h.setReducedMotion(false);
    h.clock.advance(13000);
    assert.ok(fills(h).some((fill) => !isSolid(fill)));
    h.setReducedMotion(true);
    assert.ok(fills(h).every(isSolid));
    assert.equal(h.clock.pending(), 0);
  });

  test(`${mode}: three hearts finish within twenty seconds in both layouts`, () => {
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
    ]) {
      const h = fixture(mode, { width, height });
      h.clock.advance(20000);
      assert.equal(fills(h).length, 3);
      assert.ok(fills(h).every(isSolid));
    }
  });

  test(`${mode}: the compact browser composition fits three solid hearts without overlap`, () => {
    const h = fixture(mode, {
      width: 827,
      height: 732,
      seed: "flowers-v2:07:review",
      letterPaddingTop: 144,
      letterBounds: { x: 133.5, y: 0, width: 560, height: 319.195 },
    });
    h.clock.advance(20000);
    assert.equal(fills(h).length, 3);
    assert.ok(fills(h).every(isSolid));
    const exclusion = { left: 113.5, right: 713.5, top: 122, bottom: 343.195 };
    const gardenTop = h.elements.garden.getBoundingClientRect().top - 22;
    const placed = [];
    for (const heart of h.elements.hearts.children) {
      const transform = heart.getAttribute("transform");
      const [, xText, yText, scaleText] = transform.match(
        /translate\(([-\d.]+) ([-\d.]+)\) rotate\([-\d.]+\) scale\(([-\d.]+)\)/,
      );
      const x = Number(xText),
        y = Number(yText);
      // Rounded SVG transforms can differ from the placement radius by 0.13 pixels.
      const radius = Number(scaleText) * 20 * 1.3,
        tolerance = 0.14;
      assert.ok(x - radius >= 16 - tolerance && x + radius <= 811 + tolerance);
      assert.ok(
        y - radius >= 70 - tolerance,
        "The header keeps its clear space.",
      );
      assert.ok(
        y + radius <= gardenTop + tolerance,
        "The heart stays above the garden.",
      );
      assert.ok(
        !(
          x + radius > exclusion.left + tolerance &&
          x - radius < exclusion.right - tolerance &&
          y + radius > exclusion.top + tolerance &&
          y - radius < exclusion.bottom - tolerance
        ),
        "The heart stays outside the note.",
      );
      for (const other of placed) {
        assert.ok(
          Math.hypot(x - other.x, y - other.y) >=
            radius + other.radius + 22 - tolerance * 2,
          "Each heart keeps a clear gap from the other hearts.",
        );
      }
      placed.push({ x, y, radius });
    }
  });

  test(`${mode}: each layout follows its exact five-minute schedule`, () => {
    for (const [width, height, starts] of [
      [1440, 1000, [12000, 15000, 17000, 75000, 150000, 225000, 295000]],
      [390, 844, [12000, 15000, 17000, 150000, 295000]],
    ]) {
      const h = fixture(mode, { width, height });
      // A compact note keeps every heart position available for the timer test.
      h.elements.letter.bounds = {
        x: width * 0.4,
        width: width * 0.2,
        height: 220,
      };
      const events = starts
        .flatMap((start, index) => [
          { time: start, index, type: "start" },
          { time: start + 2300, index, type: "complete" },
        ])
        .sort((a, b) => a.time - b.time);
      let count = 0;
      for (const event of events) {
        h.clock.advance(event.time - 1 - h.clock.now());
        if (event.type === "start") {
          assert.equal(
            fills(h).length,
            count,
            `No heart starts before ${event.time} ms.`,
          );
        } else {
          assert.equal(
            isSolid(fills(h)[event.index]),
            false,
            `Heart ${event.index + 1} keeps its mask until ${event.time} ms.`,
          );
        }
        h.clock.advance(1);
        if (event.type === "start") {
          assert.equal(
            fills(h).length,
            ++count,
            `Heart ${event.index + 1} starts at ${event.time} ms.`,
          );
          assert.equal(isSolid(fills(h)[event.index]), false);
        } else {
          assert.equal(
            isSolid(fills(h)[event.index]),
            true,
            `Heart ${event.index + 1} finishes at ${event.time} ms.`,
          );
        }
      }
      h.clock.advance(300000 - h.clock.now());
      assert.equal(fills(h).length, starts.length);
      assert.ok(fills(h).every(isSolid));
      assert.equal(h.clock.pending(), 0);
    }
  });

  test(`${mode}: the five-minute sequence stays bounded in both layouts`, () => {
    for (const [width, height, maximum] of [
      [1440, 1000, 7],
      [390, 844, 5],
    ]) {
      const h = fixture(mode, { width, height });
      h.clock.advance(300000);
      assert.ok(fills(h).length > 0 && fills(h).length <= maximum);
      assert.ok(fills(h).every(isSolid));
      assert.equal(h.clock.pending(), 0);
      const count = fills(h).length;
      h.clock.advance(600000);
      assert.equal(fills(h).length, count);
    }
  });
}

function renderHeart(fill, hatch, fraction, ink) {
  const scale = 8,
    width = 52 * scale,
    height = 44 * scale;
  const canvas = native.createCanvas(width, height),
    context = canvas.getContext("2d");
  context.setTransform(scale, 0, 0, scale, 26 * scale, 24 * scale);
  const shape = new native.Path2D(fill.getAttribute("d"));
  context.fillStyle = ink;
  context.fill(shape);
  if (fraction !== null) {
    const mask = native.createCanvas(width, height),
      brush = mask.getContext("2d");
    brush.setTransform(scale, 0, 0, scale, 26 * scale, 24 * scale);
    const stroke = new native.Path2D(hatch.getAttribute("d"));
    if (fraction < 1) stroke.trim(0, fraction, false);
    brush.strokeStyle = hatch.getAttribute("stroke");
    brush.lineWidth = Number(hatch.getAttribute("stroke-width"));
    brush.lineCap = hatch.getAttribute("stroke-linecap");
    if (fraction > 0) brush.stroke(stroke);
    context.resetTransform();
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask, 0, 0);
  }
  return context.getImageData(0, 0, width, height).data;
}

test("the completed scribble covers every solid interior pixel before the mask disappears", () => {
  let inspected = 0;
  for (const id of ["01", "07", "17", "24"]) {
    const h = fixture("canvas", { seed: `flowers-v2:${id}:heart-pixels` });
    h.api.reviewAt(600000);
    for (const heart of h.elements.hearts.children) {
      const fill = heart.querySelectorAll("[data-heart-fill]")[0],
        hatch = maskFor(heart).children[0];
      for (const ink of ["#252622", "#f8f7f2"]) {
        const expected = renderHeart(fill, hatch, null, ink),
          actual = renderHeart(fill, hatch, 1, ink);
        for (let index = 3; index < expected.length; index += 4) {
          if (expected[index] === 255)
            assert.equal(
              actual[index],
              255,
              `Garden ${id}: no transparent interior stripe remains.`,
            );
          if (expected[index] === 0)
            assert.equal(
              actual[index],
              0,
              "The reveal cannot extend beyond the silhouette.",
            );
        }
      }
      inspected++;
    }
  }
  assert.ok(
    inspected >= 12,
    `Only ${inspected} heart variants received a pixel check.`,
  );
});

test("the mask reveals the solid heart progressively instead of a whole-shape fade", () => {
  const h = fixture("canvas");
  h.api.reviewAt(12000);
  const heart = h.elements.hearts.children[0];
  const fill = fills(h)[0],
    hatch = maskFor(heart).children[0];
  const counts = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const pixels = renderHeart(fill, hatch, fraction, "#000");
    let opaque = 0;
    for (let index = 3; index < pixels.length; index += 4)
      if (pixels[index] === 255) opaque++;
    return opaque;
  });
  assert.equal(counts[0], 0);
  assert.ok(counts[4] > 10000);
  for (let index = 1; index < counts.length; index++)
    assert.ok(counts[index] > counts[index - 1]);
  assert.ok(counts[2] > counts[4] * 0.25 && counts[2] < counts[4] * 0.75);
});
