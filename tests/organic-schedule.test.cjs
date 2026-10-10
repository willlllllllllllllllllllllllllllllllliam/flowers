const assert = require("node:assert/strict");
const test = require("node:test");
const { createHarness } = require("./helpers/garden-harness.cjs");

const endOf = (element) =>
  Number(element.dataset.start) + Number(element.dataset.duration);

test("each garden has valid mark dependencies and matching paper masks", () => {
  const gardens = createHarness().window.FlowersCompositions;
  assert.ok(gardens.length > 0);
  for (const [index, garden] of gardens.entries()) {
    for (const [width, height] of [
      [1366, 768],
      [390, 844],
    ]) {
      const seed = `flowers-v2:${String(index + 1).padStart(2, "0")}:review`;
      const harness = createHarness({ width, height, seed });
      const label = `${garden.name}, ${width} x ${height}`;
      const marks = harness.elements.garden.querySelectorAll("[data-start]");
      const byId = new Map(
        marks.map((mark, index) => [mark.dataset.markId, { mark, index }]),
      );
      assert.equal(byId.size, marks.length, `${label}: mark IDs are unique`);
      for (const [index, mark] of marks.entries()) {
        const start = Number(mark.dataset.start);
        const duration = Number(mark.dataset.duration);
        assert.ok(Number.isFinite(start) && start >= 0, label);
        assert.ok(Number.isFinite(duration) && duration > 0, label);
        if (!mark.dataset.parentId) continue;
        const parent = byId.get(mark.dataset.parentId);
        assert.ok(parent, `${label}: parent exists`);
        assert.ok(parent.index < index, `${label}: parent precedes child`);
        assert.ok(
          start + 0.000002 >= endOf(parent.mark),
          `${label}: child waits for parent`,
        );
      }
      for (const group of harness.elements.garden.children) {
        for (let index = 0; index < group.children.length; index++) {
          const element = group.children[index];
          if (element.getAttribute("class") !== "ink-fill") continue;
          const outline = group.children[index + 1];
          assert.equal(element.dataset.start, undefined, label);
          assert.ok(outline, `${label}: paper mask has an outline`);
          assert.equal(outline.getAttribute("class"), "ink-stroke", label);
          assert.equal(
            element.getAttribute("d"),
            outline.getAttribute("d"),
            label,
          );
        }
      }
    }
  }
});

test("replay preserves the same scene and starts valid animations", () => {
  const harness = createHarness({ seed: "flowers-v2:01:review" });
  const before = harness.geometry();
  harness.window.FlowersGarden.replay();
  assert.equal(harness.geometry(), before);
  harness.setReducedMotion(false);
  assert.ok(harness.animations.length > 0);
  for (const animation of harness.animations) {
    assert.ok(Number.isFinite(animation.options.duration));
    assert.ok(animation.options.duration > 0);
  }
});
