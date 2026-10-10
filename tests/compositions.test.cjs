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
const finite = (value, label) => {
  assert.equal(typeof value, "number", `${label} must be numeric`);
  assert.ok(Number.isFinite(value), `${label} must be finite`);
};

test("the catalog has identifiable compositions", () => {
  assert.ok(Array.isArray(gardens) && gardens.length > 0);
  assert.equal(
    new Set(gardens.map((garden) => garden.id)).size,
    gardens.length,
  );
  for (const garden of gardens) {
    assert.ok(Number.isInteger(garden.id) && garden.id > 0);
    assert.equal(typeof garden.name, "string");
    assert.equal(typeof garden.description, "string");
  }
});

test("plant data contains finite dimensions and nonnegative densities", () => {
  for (const garden of gardens) {
    for (const flowers of [
      garden.blooms,
      garden.mobileBlooms ?? garden.blooms,
    ]) {
      assert.ok(Array.isArray(flowers));
      for (const flower of flowers) {
        for (const field of ["x", "y", "r", "lean"])
          finite(flower[field], `${garden.name} flower ${field}`);
        assert.ok(flower.r > 0, "A flower needs a positive radius.");
        assert.equal(typeof flower.kind, "string");
      }
    }
    for (const field of ["grass", "ferns", "leaves", "seedheads"]) {
      finite(garden[field], `${garden.name} ${field}`);
      assert.ok(garden[field] >= 0);
    }
    assert.ok(Array.isArray(garden.vines));
    for (const vine of garden.vines) {
      for (const field of ["x", "side", "length"])
        finite(vine[field], `${garden.name} vine ${field}`);
      assert.ok(vine.length >= 0);
    }
    assert.ok(Array.isArray(garden.clusters));
    for (const cluster of garden.clusters) {
      for (const field of ["x", "spread", "height"])
        finite(cluster[field], `${garden.name} cluster ${field}`);
      assert.ok(cluster.spread > 0);
      assert.ok(cluster.height >= 0);
    }
  }
});
