"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const publicFiles = require("../tools/public-files.cjs");
const root = path.resolve(__dirname, "..");

// Run the real checks against a disposable author's copy.
// Do not replace these checks with a second validator that can drift from CI.
function authorCopy(t, source) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "flowers-author-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = [
    ...publicFiles,
    "tests/notes.test.cjs",
    "tests/release.test.cjs",
    "tools/public-files.cjs",
    "tools/stage.cjs",
    "tools/serve.cjs",
    ".github/workflows/pages.yml",
  ];
  for (const relative of files) {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  }
  fs.writeFileSync(path.join(directory, "notes.js"), source);
  return directory;
}

function run(directory, args) {
  const env = { ...process.env };
  // Start a separate test runner instead of inheriting this test's child context.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, args, {
    cwd: directory,
    env,
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  if (args.includes("--test")) {
    assert.match(result.stdout, /^# tests [1-9]\d*$/m, result.stderr);
  }
  return result;
}

const checks = [
  "--test",
  "--test-reporter=tap",
  "--test-concurrency=1",
  "tests/notes.test.cjs",
  "tests/release.test.cjs",
];
const examples = [
  {
    name: "personal names and several new notes",
    notes: {
      to: "Alex,",
      from: "Love, Sam",
      messages: [
        'Happy birthday.\nYou said, "Let\'s go."',
        "Café, 雨, and flowers. ♡\r\nYou had me at fetch().",
      ],
    },
  },
  {
    name: "one note with hidden names",
    notes: {
      to: "",
      from: "",
      messages: ["An ordinary day. <b>This stays plain text.</b>"],
    },
  },
];

for (const { name, notes } of examples) {
  test(`the publication checks accept ${name}`, (t) => {
    const source = `window.FLOWERS_NOTES = ${JSON.stringify(notes)};\n`;
    const directory = authorCopy(t, source);
    const result = run(directory, checks);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const staged = run(directory, ["tools/stage.cjs"]);
    assert.equal(staged.status, 0, staged.stdout + staged.stderr);
    assert.equal(
      fs.readFileSync(path.join(directory, "dist/site/notes.js"), "utf8"),
      source,
    );
  });
}

test("the publication checks still reject an empty note list", (t) => {
  const directory = authorCopy(
    t,
    'window.FLOWERS_NOTES = {to:"",from:"",messages:[]};',
  );
  const result = run(directory, checks);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const staged = run(directory, ["tools/stage.cjs"]);
  assert.equal(staged.status, 1, staged.stdout + staged.stderr);
  assert.match(staged.stderr, /Add at least one message/);
  assert.equal(fs.existsSync(path.join(directory, "dist/site")), false);
});
