"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "..", "js", "gardens.js"), "utf8"),
  context,
);
const gardens = context.window.FlowersCompositions;
const kinds = new Set(["poppy", "cosmos", "daisy", "umbel"]);
const inRange = (value, minimum, maximum, label) => {
  assert.equal(typeof value, "number", `${label} must be numeric`);
  assert.ok(Number.isFinite(value), `${label} must be finite`);
  assert.ok(
    value >= minimum && value <= maximum,
    `${label}: ${value} is outside ${minimum}..${maximum}`,
  );
};

test("the catalog has 24 unique, named compositions", () => {
  assert.equal(gardens.length, 24);
  assert.equal(new Set(gardens.map((garden) => garden.name)).size, 24);
  assert.equal(new Set(gardens.map((garden) => garden.description)).size, 24);
  gardens.forEach((garden, index) => {
    assert.equal(garden.id, index + 1);
    assert.ok(garden.name.length > 3 && garden.name.length < 40);
    assert.ok(
      garden.description.length > 20 && garden.description.length < 140,
    );
  });
});

test("each desktop and mobile composition has its own plant arrangement", () => {
  assert.equal(
    new Set(gardens.map((garden) => JSON.stringify(garden.blooms))).size,
    24,
  );
  assert.equal(
    new Set(gardens.map((garden) => JSON.stringify(garden.mobileBlooms))).size,
    24,
  );
  gardens.forEach((garden) => {
    inRange(garden.blooms.length, 7, 15, `${garden.name} desktop count`);
    inRange(garden.mobileBlooms.length, 4, 6, `${garden.name} mobile count`);
    assert.notEqual(
      JSON.stringify(garden.mobileBlooms),
      JSON.stringify(garden.blooms.slice(0, garden.mobileBlooms.length)),
    );
  });
});

test("flowers fit the garden bounds with space above their petals", () => {
  gardens.forEach((garden) => {
    for (const [layout, flowers] of [
      ["desktop", garden.blooms],
      ["mobile", garden.mobileBlooms],
    ]) {
      flowers.forEach((flower, index) => {
        const label = `${garden.name} ${layout} flower ${index + 1}`;
        inRange(flower.x, 0, 1, `${label} x`);
        inRange(flower.y, 80, 340, `${label} y`);
        inRange(flower.r, 30, 70, `${label} radius`);
        inRange(flower.lean, -70, 70, `${label} lean`);
        assert.ok(kinds.has(flower.kind), `${label} has an unknown species`);
        assert.ok(flower.y - flower.r >= 15, `${label} touches the top edge`);
        if (flower.x > 0.4 && flower.x < 0.6) {
          assert.ok(flower.y >= 280, `${label} rises into the central gap`);
        }
      });
    }
  });
});

test("the catalog uses all four flower forms in both viewport layouts", () => {
  for (const layout of ["blooms", "mobileBlooms"]) {
    const seen = new Set(
      gardens.flatMap((garden) => garden[layout].map((flower) => flower.kind)),
    );
    assert.deepEqual([...seen].sort(), [...kinds].sort());
  }
  assert.ok(new Set(gardens.map((garden) => garden.blooms.length)).size >= 4);
  assert.ok(new Set(gardens.map((garden) => garden.vines.length)).size >= 3);
});

test("foliage profiles stay inside the renderer limits", () => {
  gardens.forEach((garden) => {
    inRange(garden.grass, 0.5, 1.5, `${garden.name} grass`);
    inRange(garden.ferns, 0, 1.5, `${garden.name} ferns`);
    inRange(garden.leaves, 0.5, 1.5, `${garden.name} leaves`);
    inRange(garden.seedheads, 0, 2, `${garden.name} seed heads`);
    inRange(garden.vines.length, 0, 2, `${garden.name} vine count`);
    garden.vines.forEach((vine) => {
      inRange(vine.x, 0, 1, `${garden.name} vine x`);
      assert.ok(vine.side === 1 || vine.side === -1);
      inRange(vine.length, 150, 360, `${garden.name} vine length`);
    });
    inRange(garden.clusters.length, 3, 4, `${garden.name} cluster count`);
    garden.clusters.forEach((cluster) => {
      inRange(cluster.x, 0, 1, `${garden.name} cluster x`);
      inRange(cluster.spread, 0.04, 0.3, `${garden.name} cluster spread`);
      inRange(cluster.height, 100, 300, `${garden.name} cluster height`);
    });
  });
});
