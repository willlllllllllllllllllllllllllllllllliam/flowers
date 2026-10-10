const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createHarness } = require("./helpers/garden-harness.cjs");

const candidate = fs.readFileSync(
  path.join(__dirname, "../js/garden.js"),
  "utf8",
);
const approved = fs.readFileSync(
  path.join(__dirname, "fixtures/v2-original-garden.js"),
  "utf8",
);
const timingAttributes =
  / data-(?:start|duration|mark-id|parent-id|role)="[^"]*"/g;
const geometryOnly = (value) => value.replace(timingAttributes, "");
const endOf = (element) =>
  Number(element.dataset.start) + Number(element.dataset.duration);
const views = [
  [1366, 768],
  [390, 844],
];
const cases = [];

test("all 24 gardens keep the approved geometry and element order in both layouts", () => {
  for (let id = 1; id <= 24; id++) {
    for (const [width, height] of views) {
      const seed = `flowers-v2:${String(id).padStart(2, "0")}:review`;
      const options = { width, height, seed };
      const baseline = createHarness({ ...options, rendererSource: approved });
      const revised = createHarness({ ...options, rendererSource: candidate });
      assert.equal(
        geometryOnly(revised.geometry()),
        geometryOnly(baseline.geometry()),
        `${seed} ${width}`,
      );
      cases.push({ label: `${seed} ${width}`, revised });
    }
  }
});

test("every dependent mark waits until its parent completes", () => {
  assert.equal(cases.length, 48);
  const roles = new Set();
  for (const { label, revised } of cases) {
    const marks = revised.elements.garden.querySelectorAll("[data-start]");
    const byId = new Map(
      marks.map((mark, index) => [mark.dataset.markId, { mark, index }]),
    );
    assert.equal(byId.size, marks.length, label);
    let dependencies = 0;
    for (const [index, mark] of marks.entries()) {
      assert.ok(mark.dataset.role, `${label}: every mark has a role`);
      roles.add(mark.dataset.role);
      assert.ok(Number(mark.dataset.start) >= 0, label);
      assert.ok(Number(mark.dataset.duration) > 0, label);
      if (!mark.dataset.parentId) continue;
      dependencies++;
      const parent = byId.get(mark.dataset.parentId);
      assert.ok(parent, `${label}: parent exists`);
      assert.ok(parent.index < index, `${label}: parent precedes child`);
      assert.ok(
        Number(mark.dataset.start) + 0.000002 >= endOf(parent.mark),
        `${label}: ${mark.dataset.role} waits for ${parent.mark.dataset.role}`,
      );
    }
    assert.ok(
      dependencies > marks.length * 0.7,
      `${label}: most marks follow structural dependencies`,
    );
    const duration = Math.max(...marks.map(endOf));
    assert.ok(
      Math.abs(duration - 10.5) < 0.000002,
      `${label}: ${duration} seconds`,
    );
  }
  for (const role of [
    "stem",
    "branch",
    "leaf-outline",
    "leaf-rib",
    "leaf-vein",
    "petal-outline",
    "petal-shading",
    "bud-outline",
    "bud-shading",
    "flower-center-outline",
    "flower-center-line",
    "flower-center-dot",
  ]) {
    assert.ok(roles.has(role), `Coverage for ${role}`);
  }
});

test("fills remain unscheduled and adjacent to their matching outlines", () => {
  for (const { label, revised } of cases) {
    for (const group of revised.elements.garden.children) {
      for (let index = 0; index < group.children.length; index++) {
        const element = group.children[index];
        if (element.getAttribute("class") !== "ink-fill") continue;
        const outline = group.children[index + 1];
        assert.equal(element.dataset.start, undefined, label);
        assert.equal(outline.getAttribute("class"), "ink-stroke", label);
        assert.equal(
          element.getAttribute("d"),
          outline.getAttribute("d"),
          label,
        );
        assert.match(outline.dataset.role, /outline$/, label);
      }
    }
  }
});

test("details follow their own shape and the schedule permits nearby plants to overlap", () => {
  for (const { label, revised } of cases) {
    const marks = revised.elements.garden.querySelectorAll("[data-start]");
    const byId = new Map(marks.map((mark) => [mark.dataset.markId, mark]));
    const expectedParents = {
      "leaf-rib": ["leaf-outline"],
      "leaf-vein": ["leaf-outline"],
      "petal-shading": ["petal-outline"],
      "bud-shading": ["bud-outline"],
      "bud-outline": ["branch"],
      "petal-outline": ["stem"],
      branch: ["stem"],
      "flower-center-outline": ["petal-outline"],
      "flower-center-line": ["petal-outline", "branch"],
      "flower-center-dot": ["flower-center-line", "flower-center-outline"],
    };
    for (const mark of marks) {
      const expected = expectedParents[mark.dataset.role];
      if (expected)
        assert.ok(
          expected.includes(byId.get(mark.dataset.parentId)?.dataset.role),
          `${label}: ${mark.dataset.role}`,
        );
    }
    const stems = marks.filter((mark) => mark.dataset.role === "stem");
    assert.ok(
      stems.some((mark, index) =>
        stems
          .slice(index + 1)
          .some(
            (other) =>
              Number(mark.dataset.start) < endOf(other) &&
              Number(other.dataset.start) < endOf(mark),
          ),
      ),
      `${label}: plants overlap`,
    );
  }
});

test("replay keeps the revised schedule and the final geometry", () => {
  const harness = createHarness({
    seed: "flowers-v2:07:review",
    rendererSource: candidate,
  });
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
