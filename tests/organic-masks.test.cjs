const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const native = require("@napi-rs/canvas");

const candidate = fs.readFileSync(
  path.join(__dirname, "..", "js", "canvas-renderer.js"),
  "utf8",
);
const approved = fs.readFileSync(
  path.join(__dirname, "fixtures", "v2-original-canvas-renderer.js"),
  "utf8",
);

function element(tagName, attributes) {
  return { tagName, getAttribute: (key) => attributes[key] ?? null };
}

function stroke(points, start, duration, weight = 2) {
  const d = points
    .map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`)
    .join(" ");
  const el = element("path", {
    class: "ink-stroke",
    d,
    "stroke-width": weight,
  });
  el.points = points;
  return { el, start, duration };
}

function group(children, opacity = 1) {
  return {
    children,
    getAttribute: (key) => (key === "opacity" ? String(opacity) : null),
  };
}

function scene() {
  const background = stroke(
    [
      [5, 40],
      [135, 40],
    ],
    0,
    100,
    4,
  );
  const shape = stroke(
    [
      [40, 20],
      [80, 20],
      [80, 60],
      [40, 60],
      [40, 20],
    ],
    1000,
    1000,
  );
  const fill = element("path", {
    class: "ink-fill",
    d: shape.el.getAttribute("d"),
  });
  const early = Array.from({ length: 6 }, (_, index) =>
    stroke(
      [
        [10 + index * 18, 85],
        [16 + index * 18, 85],
      ],
      0,
      100,
    ),
  );
  const late = stroke(
    [
      [10, 90],
      [130, 90],
    ],
    2100,
    400,
  );
  return {
    groups: [
      group([
        background.el,
        ...early.map((mark) => mark.el),
        fill,
        shape.el,
        late.el,
      ]),
    ],
    schedule: [background, ...early, shape, late],
  };
}

function fixture({
  source = candidate,
  cacheFinished = true,
  input = scene(),
  pixelRatio = 2,
  contextFailureAt = Infinity,
} = {}) {
  const canvases = [],
    frames = new Map();
  const palette = { "--ink": "#000000", "--paper": "#ffffff" };
  let time = 0,
    nextFrame = 0,
    pointReads = 0;
  for (const group of input.groups) {
    group.getBBox = () => {
      const boxes = group.children.map((el) =>
        new native.Path2D(el.getAttribute("d")).computeTightBounds(),
      );
      const x = Math.min(...boxes.map((box) => box[0])),
        y = Math.min(...boxes.map((box) => box[1]));
      return {
        x,
        y,
        width: Math.max(...boxes.map((box) => box[2])) - x,
        height: Math.max(...boxes.map((box) => box[3])) - y,
      };
    };
    for (const el of group.children.filter((el) => el.points)) {
      const distances = el.points
        .slice(1)
        .map((point, index) =>
          Math.hypot(
            point[0] - el.points[index][0],
            point[1] - el.points[index][1],
          ),
        );
      const length = distances.reduce((sum, value) => sum + value, 0);
      el.getTotalLength = () => length;
      el.getPointAtLength = (position) => {
        pointReads++;
        let remaining = position;
        for (let index = 0; index < distances.length; index++) {
          if (remaining <= distances[index] || index === distances.length - 1) {
            const fraction = Math.max(
              0,
              Math.min(1, remaining / distances[index]),
            );
            const a = el.points[index],
              b = el.points[index + 1];
            return {
              x: a[0] + (b[0] - a[0]) * fraction,
              y: a[1] + (b[1] - a[1]) * fraction,
            };
          }
          remaining -= distances[index];
        }
      };
    }
  }
  const garden = {
    children: input.groups,
    firstElementChild: input.groups[0],
    style: {},
    parentElement: { append() {} },
    getBoundingClientRect: () => ({ width: 160, height: 100 }),
  };
  const window = { devicePixelRatio: pixelRatio };
  const context = vm.createContext({
    window,
    performance,
    DOMMatrix: native.DOMMatrix,
    Path2D: native.Path2D,
    document: {
      documentElement: {},
      createElement() {
        const canvas = native.createCanvas(1, 1);
        canvas.style = {};
        canvas.setAttribute = () => {};
        canvas.remove = () => {};
        canvases.push(canvas);
        if (canvases.length === contextFailureAt)
          canvas.getContext = () => null;
        return canvas;
      },
    },
    getComputedStyle: () => ({ getPropertyValue: (key) => palette[key] }),
    requestAnimationFrame(callback) {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  });
  vm.runInContext(source, context);
  const renderer = window.FlowersCanvas.create({
    garden,
    getTime: () => time,
    cacheFinished,
    pixelRatio,
  });
  const preparation = { width: 160, height: 100, schedule: input.schedule };
  renderer.prepare(preparation);
  renderer.replay();
  return {
    renderer,
    garden,
    canvases,
    frames,
    palette,
    preparation,
    pointReads: () => pointReads,
    raw: () =>
      Buffer.from(
        canvases[0]
          .getContext("2d")
          .getImageData(0, 0, canvases[0].width, canvases[0].height).data,
      ),
    pixel(x, y) {
      return [
        ...canvases[0]
          .getContext("2d")
          .getImageData(x * pixelRatio, y * pixelRatio, 1, 1).data,
      ];
    },
    tick(value) {
      time = value;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
  };
}

test("future paper shapes do not erase existing ink", () => {
  const h = fixture();
  h.renderer.seek(999);
  assert.deepEqual(h.pixel(60, 40), [0, 0, 0, 255]);
  h.renderer.seek(1000);
  assert.deepEqual(h.pixel(60, 40), [0, 0, 0, 255]);
  h.renderer.seek(0);
  assert.equal(
    h.pixel(60, 40)[3],
    0,
    "No paper silhouette exists before the first stroke.",
  );
  h.renderer.destroy();
});

test("a paper shape follows its contour instead of a whole-shape opacity fade", () => {
  const h = fixture();
  h.renderer.seek(1500);
  assert.deepEqual(
    h.pixel(70, 40),
    [255, 255, 255, 255],
    "The completed contour prefix has full paper color.",
  );
  assert.deepEqual(
    h.pixel(50, 40),
    [0, 0, 0, 255],
    "The unreached region preserves the grass.",
  );
  h.renderer.seek(2000);
  assert.deepEqual(h.pixel(50, 40), [255, 255, 255, 255]);
  h.renderer.destroy();
});

test("the progressive paper shape stays inside the original concave shape", () => {
  const outline = stroke(
    [
      [20, 20],
      [80, 20],
      [80, 40],
      [40, 40],
      [40, 80],
      [20, 80],
      [20, 20],
    ],
    0,
    1000,
  );
  const fill = element("path", {
    class: "ink-fill",
    d: outline.el.getAttribute("d"),
  });
  const h = fixture({
    input: { groups: [group([fill, outline.el])], schedule: [outline] },
  });
  for (const time of [250, 500, 750, 999]) {
    h.renderer.seek(time);
    assert.equal(
      h.pixel(60, 60)[3],
      0,
      `The mask does not paint outside the original path at ${time} ms.`,
    );
  }
  h.renderer.destroy();
});

test("a paper shape requires the next matching timed outline", () => {
  const input = scene();
  input.groups[0].children.splice(8, 1);
  const h = fixture({ input });
  assert.equal(h.renderer.getState().fallback, "static-svg");
  assert.equal(h.garden.style.visibility, "");
});

test("the final artwork matches the approved renderer in both themes", () => {
  const next = fixture(),
    old = fixture({ source: approved });
  for (const night of [false, true]) {
    for (const h of [next, old]) {
      if (night) {
        h.palette["--ink"] = "#ffffff";
        h.palette["--paper"] = "#151515";
      }
      h.renderer.replay(true);
    }
    assert.deepEqual(
      next.raw(),
      old.raw(),
      `The final ${night ? "night" : "day"} pixels are unchanged.`,
    );
  }
  next.renderer.destroy();
  old.renderer.destroy();
});

test("cached paper masks match direct output through rewind and theme replay", () => {
  const cached = fixture(),
    direct = fixture({ cacheFinished: false });
  for (const time of [
    200, 900, 1100, 1500, 1900, 2200, 2600, 1300, 500, 1600,
  ]) {
    cached.renderer.seek(time);
    direct.renderer.seek(time);
    assert.deepEqual(
      cached.raw(),
      direct.raw(),
      `The cache matches at ${time} ms.`,
    );
  }
  assert.ok(cached.renderer.getState().reusedMarks > 0);
  assert.ok(
    cached.renderer.getState().renderedMarks <
      direct.renderer.getState().renderedMarks,
  );
  for (const h of [cached, direct]) {
    h.palette["--ink"] = "#ffffff";
    h.palette["--paper"] = "#151515";
    h.renderer.prepare(h.preparation);
    h.renderer.replay();
    h.renderer.seek(1500);
  }
  assert.deepEqual(cached.raw(), direct.raw());
  for (const h of [cached, direct]) {
    h.renderer.finish();
    h.renderer.resume();
    assert.equal(h.frames.size, 0);
    assert.equal(h.renderer.getState().prefixPixelBytes, 0);
    assert.ok(
      h.renderer.getState().estimatedPixelBytes <=
        h.renderer.getState().pixelBudgetBytes,
    );
    h.renderer.destroy();
  }
});

test("generated mask paths need no native point queries", () => {
  const h = fixture();
  assert.equal(h.pointReads(), 0);
  assert.equal(h.renderer.getState().maskSamples, 33);
  assert.equal(h.renderer.getState().fillMasks, 1);
  for (let time = 0; time <= 2600; time += 20) h.renderer.seek(time);
  h.renderer.replay();
  h.renderer.prepare(h.preparation);
  h.renderer.finish();
  assert.equal(h.pointReads(), 0);
  assert.equal(h.renderer.getState().geometryPreparations, 1);
  h.renderer.destroy();
});

function sampler() {
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(
    candidate.replace(
      /(window\.FlowersCanvas\s*=\s*Object\.freeze\(\{)([^}]*)(\}\))/,
      "$1$2, sampleContour$3",
    ),
    context,
  );
  return window.FlowersCanvas.sampleContour;
}

test("the contour sampler preserves polygon corners and its layer transform", () => {
  const points = sampler()("M40,20 L80,20 80,60 40,60Z", 2, 0.5, {
    x: 4,
    y: 3,
  });
  assert.equal(points.length, 33);
  for (const [index, x, y] of [
    [0, 76, 7],
    [8, 156, 7],
    [16, 156, 27],
    [24, 76, 27],
    [32, 76, 7],
  ]) {
    assert.equal(points[index].x, x);
    assert.equal(points[index].y, y);
  }
  const exponent = sampler()("M1e1 1e1 L2e1 1e1 L1e1 1e1 Z", 1, 1, {
    x: 0,
    y: 0,
  });
  assert.equal(exponent[16].x, 20);
});

function referenceContour(curve) {
  const samples = Array.from({ length: 8193 }, (_, index) =>
    curve(index / 8192),
  );
  samples.push(samples[0]);
  const distances = [0];
  for (let index = 1; index < samples.length; index++)
    distances.push(
      distances[index - 1] +
        Math.hypot(
          samples[index][0] - samples[index - 1][0],
          samples[index][1] - samples[index - 1][1],
        ),
    );
  return Array.from({ length: 33 }, (_, index) => {
    const target = (distances.at(-1) * index) / 32;
    let low = 0,
      high = distances.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (distances[mid] < target) low = mid;
      else high = mid;
    }
    const fraction =
      (target - distances[low]) / (distances[high] - distances[low] || 1);
    return [
      samples[low][0] + (samples[high][0] - samples[low][0]) * fraction,
      samples[low][1] + (samples[high][1] - samples[low][1]) * fraction,
    ];
  });
}

test("curve samples stay within one logical pixel of a dense arc-length reference", () => {
  const cases = [
    [
      "M0 0C0 100 100 100 100 0L0 0Z",
      (t) => [300 * (1 - t) * t * t + 100 * t * t * t, 300 * (1 - t) * t],
    ],
    ["M0 0Q50 100 100 0L0 0Z", (t) => [100 * t, 200 * (1 - t) * t]],
  ];
  for (const [d, curve] of cases) {
    const actual = sampler()(d, 1, 1, { x: 0, y: 0 });
    const expected = referenceContour(curve);
    const maxError = Math.max(
      ...actual.map((point, index) =>
        Math.hypot(point.x - expected[index][0], point.y - expected[index][1]),
      ),
    );
    assert.ok(
      maxError < 1,
      `The maximum contour error is ${maxError} logical pixels.`,
    );
    assert.equal(actual[0].x, 0);
    assert.equal(actual[32].x, 0);
  }
});

test("unsupported or malformed paths select the native fallback", () => {
  const sample = sampler();
  for (const d of [
    "M0 0h20v20z",
    "M0 0A10 10 0 0 0 20 20Z",
    "M0 0M20 20L30 30",
    "M0 0C2 3",
    "Z",
    "",
  ]) {
    assert.equal(sample(d, 1, 1, { x: 0, y: 0 }), null);
  }
  const input = scene();
  const outline = input.groups[0].children[8],
    fill = input.groups[0].children[7];
  for (const el of [fill, outline]) {
    const original = el.getAttribute;
    el.getAttribute = (key) =>
      key === "d" ? "M40 20H80V60H40Z" : original(key);
  }
  const h = fixture({ input });
  assert.equal(h.pointReads(), 33);
  h.renderer.seek(1500);
  assert.deepEqual(h.pixel(70, 40), [255, 255, 255, 255]);
  assert.deepEqual(h.pixel(50, 40), [0, 0, 0, 255]);
  h.renderer.destroy();
});

test("the Canvas frame loop stops during pause and after the last mark", () => {
  const h = fixture();
  h.renderer.resume();
  assert.equal(h.frames.size, 1);
  h.tick(600);
  assert.equal(h.frames.size, 1);
  h.renderer.pause();
  assert.equal(h.frames.size, 0);
  h.renderer.resume();
  assert.equal(h.frames.size, 1);
  h.tick(2600);
  assert.equal(h.frames.size, 0);
  assert.equal(h.renderer.getState().activeLayers, 0);
  h.renderer.destroy();
  assert.equal(h.frames.size, 0);
});

test("missing Canvas contexts keep the complete SVG visible without timers", () => {
  for (const contextFailureAt of [1, 2]) {
    const h = fixture({ contextFailureAt });
    assert.equal(h.renderer.getState().fallback, "static-svg");
    assert.equal(h.garden.style.visibility, "");
    assert.equal(h.frames.size, 0);
    for (const method of ["pause", "resume", "finish", "replay", "destroy"]) {
      assert.doesNotThrow(() => h.renderer[method]());
    }
    assert.doesNotThrow(() => h.renderer.seek(600));
    assert.doesNotThrow(() => h.renderer.prepare(h.preparation));
    assert.equal(h.frames.size, 0);
  }
});

test("a later Canvas draw failure stops the frame loop and reveals the SVG", () => {
  const h = fixture();
  h.renderer.resume();
  assert.equal(h.frames.size, 1);
  h.canvases[0].getContext("2d").clearRect = () => {
    throw new Error("The browser lost the Canvas context.");
  };
  assert.doesNotThrow(() => h.tick(600));
  assert.equal(h.renderer.getState().fallback, "static-svg");
  assert.equal(h.renderer.getState().running, false);
  assert.equal(h.garden.style.visibility, "");
  assert.equal(h.frames.size, 0);
});
