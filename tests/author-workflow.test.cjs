"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const publicFiles = require("../tools/public-files.cjs");
const root = path.resolve(__dirname, "..");

// Test the actual publication command without test files or installed packages.
function authorCopy(t, source) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "flowers-author-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = [...publicFiles, "tools/public-files.cjs", "tools/stage.cjs"];
  for (const relative of files) {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  }
  fs.writeFileSync(path.join(directory, "notes.js"), source);
  return directory;
}

function run(directory, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: directory,
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

const examples = [
  {
    name: "personal names and several new notes",
    notes: {
      to: "Alex,",
      from: "Love, Sam",
      messages: [
        'Happy birthday.\nYou said, "Let\'s go."',
        "Café, 雨, and flowers. ♡\r\nYou had me at fetch(). /Users/us/ is just text.",
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
    const staged = run(directory, ["tools/stage.cjs"]);
    assert.equal(staged.status, 0, staged.stdout + staged.stderr);
    assert.equal(fs.existsSync(path.join(directory, "node_modules")), false);
    assert.equal(fs.existsSync(path.join(directory, "tests")), false);
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
  const staged = run(directory, ["tools/stage.cjs"]);
  assert.equal(staged.status, 1, staged.stdout + staged.stderr);
  assert.match(staged.stderr, /Add at least one message/);
  assert.equal(fs.existsSync(path.join(directory, "dist/site")), false);
});

test("publication accepts the README example with a new image, font, and module", (t) => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const example = readme.match(/```js\n([\s\S]*?)\n```/);
  assert.ok(example, "Keep a complete notes example in the README.");
  const directory = authorCopy(t, example[1]);
  const write = (file, source) =>
    fs.writeFileSync(path.join(directory, file), source);
  const edit = (file, transform) =>
    write(file, transform(fs.readFileSync(path.join(directory, file), "utf8")));
  fs.renameSync(
    path.join(directory, "assets/Walkway-SemiBold.ttf"),
    path.join(directory, "assets/My Font.ttf"),
  );
  edit("tools/public-files.cjs", (source) =>
    source.replace(
      '"assets/Walkway-SemiBold.ttf"',
      '"assets/My Font.ttf", "assets/photo.svg", "js/personal.js", "js/greeting.js"',
    ),
  );
  edit("styles.css", (source) =>
    source.replaceAll("Walkway-SemiBold.ttf", "My%20Font.ttf"),
  );
  edit("index.html", (source) =>
    source
      .replace(
        "</head>",
        '<script type = "module" src = "js/personal.js"></script></head>',
      )
      .replace(
        "</main>",
        '<img src="assets/photo.svg?v=2" alt="Our photo"></main>',
      ),
  );
  write(
    "assets/photo.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
  );
  write(
    "js/personal.js",
    'import { greeting } from "./greeting.js"; console.log(greeting);',
  );
  write("js/greeting.js", 'export const greeting = "For someone dear";');
  write("private-draft.txt", "Do not publish this draft.");
  const result = run(directory, ["tools/stage.cjs"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const file of [
    "assets/My Font.ttf",
    "assets/photo.svg",
    "js/personal.js",
  ])
    assert.deepEqual(
      fs.readFileSync(path.join(directory, "dist/site", file)),
      fs.readFileSync(path.join(directory, file)),
    );
  assert.equal(
    fs.existsSync(path.join(directory, "dist/site/private-draft.txt")),
    false,
  );
  assert.equal(
    fs.existsSync(
      path.join(directory, "dist/site/assets/Walkway-SemiBold.ttf"),
    ),
    false,
  );
});

test("publication rejects an asset-list path outside the project", (t) => {
  const directory = authorCopy(
    t,
    'window.FLOWERS_NOTES = {to:"",from:"",messages:["A note."]};',
  );
  fs.appendFileSync(
    path.join(directory, "tools/public-files.cjs"),
    '\nmodule.exports = [...module.exports, "../private.txt"];\n',
  );
  const result = run(directory, ["tools/stage.cjs"]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Use a path inside the project/);
  assert.equal(fs.existsSync(path.join(directory, "dist/site")), false);
});
