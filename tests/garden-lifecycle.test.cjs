const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { createHarness } = require("./helpers/garden-harness.cjs");

function visibleHearts(harness) {
  return harness.elements.hearts.children
    .filter((heart) => heart.style.display !== "none")
    .map((heart) => {
      const match = /translate\(([-\d.]+) ([-\d.]+)\).*scale\(([-\d.]+)\)/.exec(
        heart.getAttribute("transform"),
      );
      assert.ok(match, "A heart needs a finite transform.");
      return {
        x: Number(match[1]),
        y: Number(match[2]),
        radius: Number(match[3]) * 20 * 1.25,
      };
    });
}

function checkArtBounds(harness) {
  const paper = harness.elements.paper.getBoundingClientRect();
  const garden = harness.elements.garden.getBoundingClientRect();
  for (const heart of visibleHearts(harness)) {
    assert.ok(heart.x - heart.radius >= 15, "A heart crosses the left margin.");
    assert.ok(
      heart.x + heart.radius <= paper.width - 15,
      "A heart crosses the right margin.",
    );
    assert.ok(heart.y - heart.radius >= 86, "A heart enters the header.");
    assert.ok(
      heart.y + heart.radius <= garden.top - paper.top - 20,
      "A heart enters the garden.",
    );
  }
}

test("the heart sequence stops after five active minutes on desktop and mobile", () => {
  for (const [width, height, maximum] of [
    [1440, 900, 7],
    [390, 844, 5],
  ]) {
    const harness = createHarness({ width, height, reducedMotion: false });
    harness.clock.advance(300000);
    const state = harness.window.FlowersGarden.getState();
    assert.ok(state.hearts > 0 && state.hearts <= maximum);
    assert.equal(harness.clock.pending(), 0);
    checkArtBounds(harness);
    const transforms = harness.elements.hearts.children.map((heart) =>
      heart.getAttribute("transform"),
    );
    harness.clock.advance(300000);
    assert.deepEqual(
      harness.elements.hearts.children.map((heart) =>
        heart.getAttribute("transform"),
      ),
      transforms,
    );
    assert.equal(harness.clock.pending(), 0);
  }
});

test("pause during a hidden interval never counts hidden or paused time", () => {
  const harness = createHarness({ reducedMotion: false });
  harness.clock.advance(5000);
  harness.setHidden(true);
  harness.clock.advance(60000);
  harness.window.FlowersGarden.pause();
  harness.clock.advance(20000);
  harness.setHidden(false);
  harness.clock.advance(20000);
  assert.equal(harness.window.FlowersGarden.getState().activeTime, 5000);
  assert.equal(harness.window.FlowersGarden.getState().hearts, 0);
  harness.window.FlowersGarden.resume();
  harness.clock.advance(6999);
  assert.equal(harness.window.FlowersGarden.getState().hearts, 0);
  harness.clock.advance(1);
  assert.equal(harness.window.FlowersGarden.getState().hearts, 1);
});

test("existing hearts remain outside the garden after a long note becomes short", () => {
  const harness = createHarness({ reducedMotion: false });
  harness.elements.paper.bounds = { height: 1800 };
  harness.elements.letter.bounds = { height: 1300 };
  harness.elements.garden.bounds = { y: 1478, height: 270 };
  harness.clock.advance(300000);
  const count = harness.elements.hearts.children.length;
  harness.elements.paper.bounds = null;
  harness.elements.letter.bounds = null;
  harness.elements.garden.bounds = null;
  harness.window.dispatchEvent({
    type: "flowers:notes",
    detail: { seed: harness.window.FlowersGarden.getState().seed },
  });
  harness.clock.advance(16);
  assert.equal(
    harness.elements.hearts.children.length,
    count,
    "A note change must not reset the hearts.",
  );
  checkArtBounds(harness);
});

test("small height changes reposition hearts without restarting the scene", () => {
  const harness = createHarness({
    width: 1440,
    height: 900,
    reducedMotion: false,
  });
  harness.clock.advance(300000);
  const count = harness.elements.hearts.children.length;
  harness.resize(1440, 880);
  harness.clock.advance(180);
  assert.equal(harness.elements.hearts.children.length, count);
  assert.ok(harness.window.FlowersGarden.getState().activeTime >= 300000);
  checkArtBounds(harness);
});

test("reduced motion cancels pending hearts and replay leaves no active timers", () => {
  const harness = createHarness({ reducedMotion: false });
  harness.clock.advance(18000);
  harness.setReducedMotion(true);
  assert.equal(harness.clock.pending(), 0);
  assert.ok(
    harness.animations.every((animation) =>
      ["idle", "finished"].includes(animation.playState),
    ),
  );
  harness.window.FlowersGarden.replay();
  assert.equal(harness.clock.pending(), 0);
  assert.ok(
    harness.animations.every((animation) =>
      ["idle", "finished"].includes(animation.playState),
    ),
  );
  checkArtBounds(harness);
});

test("reviewAt exists only in the marked review iframe", () => {
  assert.equal(createHarness().window.FlowersGarden.reviewAt, undefined);
  assert.equal(
    createHarness({ review: true, inFrame: false }).window.FlowersGarden
      .reviewAt,
    undefined,
  );
  assert.equal(
    createHarness({ review: true, reviewMarker: false }).window.FlowersGarden
      .reviewAt,
    undefined,
  );
  const harness = createHarness({ review: true, reducedMotion: false });
  assert.equal(typeof harness.window.FlowersGarden.reviewAt, "function");
  harness.window.FlowersGarden.reviewAt(62000);
  const state = harness.window.FlowersGarden.getState();
  assert.equal(state.activeTime, 62000);
  assert.equal(state.paused, true);
  assert.equal(harness.clock.pending(), 0);
  assert.ok(state.hearts > 0);
  checkArtBounds(harness);
});

test("replay restarts the same garden and resets its hearts and animation clock", () => {
  const harness = createHarness({
    seed: "flowers-v2:17:theme-replay",
    reducedMotion: false,
  });
  harness.clock.advance(62000);
  const before = harness.window.FlowersGarden.getState();
  assert.ok(before.hearts > 0);
  const geometryHash = () =>
    createHash("sha256").update(harness.geometry()).digest("hex");
  const beforeGeometry = geometryHash();
  const previousAnimations = [...harness.animations];

  harness.window.FlowersGarden.replay();

  const after = harness.window.FlowersGarden.getState();
  assert.equal(after.seed, before.seed);
  assert.equal(after.composition, before.composition);
  assert.equal(geometryHash(), beforeGeometry);
  assert.equal(after.hearts, 0);
  assert.equal(harness.elements.hearts.children.length, 0);
  assert.equal(after.activeTime, 0);
  assert.equal(after.paused, false);
  assert.ok(
    previousAnimations.every((animation) => animation.playState === "idle"),
  );
  const freshAnimations = harness.animations.slice(previousAnimations.length);
  assert.ok(freshAnimations.length > 0);
  assert.ok(
    freshAnimations.every(
      (animation) =>
        animation.currentTime === 0 && animation.playState === "running",
    ),
  );

  harness.clock.advance(11999);
  assert.equal(harness.window.FlowersGarden.getState().hearts, 0);
  harness.clock.advance(1);
  assert.ok(harness.window.FlowersGarden.getState().hearts > 0);
});
