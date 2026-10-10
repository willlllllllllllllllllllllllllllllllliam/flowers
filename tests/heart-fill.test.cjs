const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createHarness } = require("./helpers/garden-harness.cjs");
const native = require("@napi-rs/canvas");

const source = fs.readFileSync(path.join(__dirname, "../js/garden.js"), "utf8");
const modes = ["canvas", "baseline"];
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
      layoutAdapter + (mode === "canvas" ? canvasAdapter : "") + source,
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

// The virtual-clock limit catches runaway timers. It does not set the artwork's pace.
const maxSequenceTime = 60 * 60 * 1000;

function advanceUntil(harness, condition) {
  for (
    let elapsed = 0;
    elapsed < maxSequenceTime && !condition();
    elapsed += 100
  )
    harness.clock.advance(100);
  assert.ok(condition(), "The animation did not reach the expected state.");
}

function firstHeart(harness) {
  advanceUntil(harness, () => fills(harness).length > 0);
  return fills(harness)[0];
}

for (const mode of modes) {
  test(`${mode}: each heart uses a finite mask, then becomes solid ink`, () => {
    const h = fixture(mode);
    const fill = firstHeart(h);
    const heart = h.elements.hearts.children[0];
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
    assert.equal(hatch.getAttribute("stroke"), "#fff");
    assert.ok(Number(hatch.getAttribute("stroke-width")) > 0);
    for (const name of ["x", "y", "width", "height"])
      assert.ok(Number.isFinite(Number(mask.getAttribute(name))));
    advanceUntil(h, () => isSolid(fill));
    assert.equal(fill.getAttribute("mask"), null);
  });

  test(`${mode}: a pause or hidden page cannot complete a heart early`, () => {
    const h = fixture(mode);
    const fill = firstHeart(h);
    assert.equal(isSolid(fill), false);
    const activeTime = h.api.getState().activeTime;
    h.api.pause();
    h.clock.advance(60000);
    assert.equal(h.api.getState().activeTime, activeTime);
    assert.equal(isSolid(fill), false);
    h.api.resume();
    h.setHidden(true);
    h.clock.advance(60000);
    assert.equal(h.api.getState().activeTime, activeTime);
    assert.equal(isSolid(fill), false);
    h.setHidden(false);
    advanceUntil(h, () => isSolid(fill));
  });

  test(`${mode}: finish releases masks and replay resets the hearts`, () => {
    const h = fixture(mode);
    firstHeart(h);
    h.api.finish();
    assert.ok(fills(h).every(isSolid));
    const completed = h.api.getState().completedEffects;
    h.api.finish();
    assert.equal(h.api.getState().completedEffects, completed);
    const before = h.geometry();
    h.api.replay();
    assert.equal(fills(h).length, 0);
    assert.equal(h.geometry(), before);
    firstHeart(h);
    h.api.finish();
    assert.ok(fills(h).every(isSolid));
  });

  test(`${mode}: review seeks pause without timers or stale heart masks`, () => {
    const h = fixture(mode);
    firstHeart(h);
    const time = h.api.getState().activeTime;
    h.api.reviewAt(time);
    assert.ok(fills(h).length > 0);
    assert.ok(fills(h).some((fill) => !isSolid(fill)));
    assert.equal(h.clock.pending(), 0);
    h.api.resume();
    advanceUntil(h, () => fills(h).every(isSolid));
    h.api.reviewAt(h.api.getState().activeTime);
    assert.ok(fills(h).every(isSolid));
    assert.equal(h.clock.pending(), 0);
  });

  test(`${mode}: reduced motion renders solid hearts without effect timers`, () => {
    const h = fixture(mode, { reducedMotion: true });
    assert.ok(fills(h).length > 0);
    assert.ok(fills(h).every(isSolid));
    assert.equal(h.clock.pending(), 0);
    h.setReducedMotion(false);
    firstHeart(h);
    h.setReducedMotion(true);
    assert.ok(fills(h).every(isSolid));
    assert.equal(h.clock.pending(), 0);
  });

  test(`${mode}: the compact layout keeps hearts clear of notes and other artwork`, () => {
    const letterBounds = { x: 133.5, y: 0, width: 560, height: 319.195 };
    const letterPaddingTop = 144;
    const h = fixture(mode, {
      width: 827,
      height: 732,
      seed: "flowers-v2:01:review",
      letterPaddingTop,
      letterBounds,
    });
    h.clock.advance(maxSequenceTime);
    assert.ok(fills(h).length > 0);
    assert.ok(fills(h).every(isSolid));
    const paper = h.elements.paper.getBoundingClientRect();
    const garden = h.elements.garden.getBoundingClientRect();
    const exclusion = {
      left: letterBounds.x,
      right: letterBounds.x + letterBounds.width,
      top: letterPaddingTop,
      bottom: letterBounds.height,
    };
    const placed = [];
    for (const heart of h.elements.hearts.children) {
      const [, xText, yText, scaleText] = heart
        .getAttribute("transform")
        .match(
          /translate\(([-\d.]+) ([-\d.]+)\) rotate\([-\d.]+\) scale\(([-\d.]+)\)/,
        );
      const x = Number(xText),
        y = Number(yText);
      const fill = heart.querySelectorAll("[data-heart-fill]")[0];
      const bounds = new native.Path2D(
        fill.getAttribute("d"),
      ).computeTightBounds();
      const radius =
        Math.hypot(
          Math.max(Math.abs(bounds[0]), Math.abs(bounds[2])),
          Math.max(Math.abs(bounds[1]), Math.abs(bounds[3])),
        ) * Number(scaleText);
      assert.ok(x - radius >= 0 && x + radius <= paper.width);
      assert.ok(y - radius >= 0);
      assert.ok(y + radius <= garden.top - paper.top);
      assert.ok(
        !(
          x + radius > exclusion.left &&
          x - radius < exclusion.right &&
          y + radius > exclusion.top &&
          y - radius < exclusion.bottom
        ),
        "A heart cannot cover the note.",
      );
      for (const other of placed)
        assert.ok(
          Math.hypot(x - other.x, y - other.y) >= radius + other.radius,
        );
      placed.push({ x, y, radius });
    }
  });

  test(`${mode}: heart timers stop after the sequence on desktop and mobile`, () => {
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
    ]) {
      const h = fixture(mode, { width, height });
      h.clock.advance(maxSequenceTime);
      assert.ok(fills(h).length > 0);
      assert.ok(fills(h).every(isSolid));
      assert.equal(h.clock.pending(), 0);
      const count = fills(h).length;
      h.clock.advance(maxSequenceTime);
      assert.equal(fills(h).length, count);
      assert.equal(h.clock.pending(), 0);
    }
  });
}

function renderHeart(fill, hatch, fraction, ink) {
  const shape = new native.Path2D(fill.getAttribute("d"));
  const [left, top, right, bottom] = shape.computeTightBounds();
  const scale = 8,
    width = Math.ceil((right - left + 4) * scale),
    height = Math.ceil((bottom - top + 4) * scale);
  const canvas = native.createCanvas(width, height),
    context = canvas.getContext("2d");
  const offsetX = (2 - left) * scale,
    offsetY = (2 - top) * scale;
  context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  context.fillStyle = ink;
  context.fill(shape);
  if (fraction !== null) {
    const mask = native.createCanvas(width, height),
      brush = mask.getContext("2d");
    brush.setTransform(scale, 0, 0, scale, offsetX, offsetY);
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
  for (const id of ["01", "02"]) {
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
  assert.ok(inspected > 0, "The pixel check needs at least one heart.");
});

test("the mask reveals the solid heart progressively instead of a whole-shape fade", () => {
  const h = fixture("canvas");
  firstHeart(h);
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
  assert.ok(counts[4] > 0);
  for (let index = 1; index < counts.length; index++)
    assert.ok(counts[index] > counts[index - 1]);
});
