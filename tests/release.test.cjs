"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { stageSite, validateSources } = require("../tools/stage.cjs");
const { createServer } = require("../tools/serve.cjs");
const publicFiles = require("../tools/public-files.cjs");
const root = path.resolve(__dirname, "..");

function fixture(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "flowers-release-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const relative of publicFiles) {
    const filename = path.join(directory, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(
      filename,
      relative.endsWith(".ttf") ? Buffer.alloc(128) : "",
    );
  }
  fs.writeFileSync(
    path.join(directory, "notes.js"),
    'window.FLOWERS_NOTES = {to:"",from:"",messages:["For you."]};',
  );
  fs.writeFileSync(
    path.join(directory, "index.html"),
    '<!doctype html><link rel="stylesheet" href="styles.css"><script src="notes.js"></script><script src="js/app.js"></script>',
  );
  fs.writeFileSync(
    path.join(directory, "styles.css"),
    '@font-face{src:url("assets/Walkway-SemiBold.ttf")}',
  );
  return directory;
}

function filesUnder(directory, prefix = "") {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix + entry.name;
      return entry.isDirectory()
        ? filesUnder(path.join(directory, entry.name), `${relative}/`)
        : [relative];
    })
    .sort();
}

function request(server, url, method = "GET") {
  const headers = {};
  let status, body;
  const response = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(code, values = {}) {
      status = code;
      for (const [name, value] of Object.entries(values))
        this.setHeader(name, value);
      return this;
    },
    end(value) {
      body = value;
    },
  };
  server.emit("request", { url, method }, response);
  return { status, headers, body };
}

test("the actual release contains valid notes and its declared assets", () => {
  const contents = validateSources();
  assert.equal(contents.size, publicFiles.length);
  assert.ok(contents.has("index.html"));
  assert.ok(contents.has("notes.js"));
});

test("stage includes only the public allowlist and removes stale generated files", (t) => {
  const directory = fixture(t);
  for (const relative of [
    "README.md",
    "private-note.txt",
    "dev/review.html",
    "tests/private-test.js",
  ]) {
    const filename = path.join(directory, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, "Never publish this file.");
  }
  const first = stageSite(directory);
  const expected = [...publicFiles, ".nojekyll"].sort();
  assert.deepEqual(filesUnder(first.destination), expected);
  fs.writeFileSync(
    path.join(first.destination, "old-private-file.txt"),
    "Stale output.",
  );
  const second = stageSite(directory);
  assert.deepEqual(filesUnder(second.destination), expected);
  for (const relative of publicFiles)
    assert.deepEqual(
      fs.readFileSync(path.join(second.destination, relative)),
      fs.readFileSync(path.join(directory, relative)),
    );
});

test("stage permits custom note fields and embedded paper textures", (t) => {
  const directory = fixture(t);
  fs.writeFileSync(
    path.join(directory, "notes.js"),
    'window.FLOWERS_NOTES = {to:"",from:"",messages:["Note."],occasion:"Birthday"};',
  );
  fs.appendFileSync(
    path.join(directory, "styles.css"),
    "body{background-image:url(\"data:image/svg+xml,%3Cpath filter='url(%23n)'/%3E\")}",
  );
  assert.doesNotThrow(() => stageSite(directory));
});

test("stage fails before it changes the last artifact when source validation fails", (t) => {
  const directory = fixture(t);
  const original = stageSite(directory);
  const before = fs.readFileSync(path.join(original.destination, "notes.js"));
  for (const source of [
    'window.FLOWERS_NOTES = {to:"",from:"",messages:[]};',
    'window.FLOWERS_NOTES = {to:"",from:"",messages:[""]};',
    'window.FLOWERS_NOTES = {to:"",from:"",messages:[null]};',
    'window.FLOWERS_NOTES = {to:5,from:"",messages:["note"]};',
    "window.FLOWERS_NOTES = {",
    "",
  ]) {
    fs.writeFileSync(path.join(directory, "notes.js"), source);
    assert.throws(() => stageSite(directory));
    assert.deepEqual(
      fs.readFileSync(path.join(original.destination, "notes.js")),
      before,
    );
  }
});

test("stage rejects symlink sources, parent directories, and output destinations", (t) => {
  for (const kind of ["file", "parent", "dist", "site"]) {
    const directory = fixture(t);
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "flowers-link-test-"),
    );
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    if (kind === "file") {
      fs.writeFileSync(
        path.join(outside, "notes.js"),
        'window.FLOWERS_NOTES={to:"",from:"",messages:["secret"]};',
      );
      fs.unlinkSync(path.join(directory, "notes.js"));
      fs.symlinkSync(
        path.join(outside, "notes.js"),
        path.join(directory, "notes.js"),
      );
    } else if (kind === "parent") {
      fs.renameSync(
        path.join(directory, "assets"),
        path.join(outside, "assets"),
      );
      fs.symlinkSync(
        path.join(outside, "assets"),
        path.join(directory, "assets"),
        "dir",
      );
    } else {
      const destination =
        kind === "dist"
          ? path.join(directory, "dist")
          : path.join(directory, "dist/site");
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(outside, destination, "dir");
    }
    assert.throws(
      () => stageSite(directory),
      /symbolic link|normal output directory/,
    );
    assert.ok(fs.existsSync(outside));
  }
});

test("stage rejects missing files, invalid scripts, and nonportable asset paths", (t) => {
  for (const [file, source] of [
    ["js/app.js", "const broken = ;"],
    ["styles.css", "body{background:url(file:///private/photo.png)}"],
    ["styles.css", "body{background:url(http://example.com/image.png)}"],
    ["index.html", '<script src="/js/app.js"></script>'],
    ["index.html", '<script src="dev/review.js"></script>'],
    ["index.html", "<script>const broken = ;</script>"],
    ["index.html", '<script type="module">export const broken = ;</script>'],
    ["index.html", '<img src="assets/missing.png">'],
    ["index.html", '<img src = "assets/missing.png">'],
    ["index.html", "<img src=assets/missing.png>"],
    ["styles.css", '@import "missing.css";'],
  ]) {
    const directory = fixture(t);
    fs.writeFileSync(path.join(directory, file), source);
    assert.throws(() => stageSite(directory));
  }
  const directory = fixture(t);
  fs.unlinkSync(path.join(directory, "assets/Walkway-SemiBold.ttf"));
  assert.throws(
    () => stageSite(directory),
    /Missing public file.*tools\/public-files/,
  );
});

test("stage permits HTTPS assets, URL suffixes, and literal path text", (t) => {
  const directory = fixture(t);
  fs.writeFileSync(
    path.join(directory, "notes.js"),
    'window.FLOWERS_NOTES = {to:"",from:"",messages:["Our file:// memory lives at /home/us/ and /Users/us/. You had me at fetch()."]};',
  );
  fs.writeFileSync(
    path.join(directory, "index.html"),
    '<link href="styles.css?v=2"><img src="assets/flower.svg#petal"><img src="https://example.com/photo.jpg"><script type="application/ld+json">{"name":"Flowers"}</script><script>const html = \'<img src="not-an-asset.png">\';</script><!-- <img src="old.png"> -->',
  );
  fs.writeFileSync(
    path.join(directory, "styles.css"),
    '@font-face{src:url("assets/Walkway-SemiBold.ttf?v=2")} body{background:url("https://example.com/paper.png")} /* url(old.png) */',
  );
  assert.doesNotThrow(() => stageSite(directory));
});

test("the local server serves only public files and the three review files", (t) => {
  const directory = fixture(t);
  fs.mkdirSync(path.join(directory, "dev"));
  fs.writeFileSync(path.join(directory, "dev/review.html"), "Review only.");
  const server = createServer({ root: directory });
  for (const url of [
    "/",
    "/index.html",
    "/notes.js",
    "/js/app.js",
    "/dev/review.html",
  ]) {
    assert.equal(request(server, url).status, 200, url);
  }
  for (const url of [
    "/.git/config",
    "/README.md",
    "/package-lock.json",
    "/tools/stage.cjs",
    "/dist/site/index.html",
    "/../private-note.txt",
    "/%2e%2e%2fprivate-note.txt",
    "/dev/private.js",
    "/%E0%A4%A",
  ]) {
    assert.ok([400, 404].includes(request(server, url).status), url);
  }
  const head = request(server, "/notes.js", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, undefined);
  assert.ok(head.headers["content-length"] > 0);
  assert.equal(head.headers["cache-control"], "no-store");
  assert.equal(request(server, "/notes.js", "POST").status, 405);
  assert.equal(request(server, "/notes.js", "DELETE").status, 405);
});

test("the local server supports a GitHub project path without root-relative assets", (t) => {
  const directory = fixture(t);
  const server = createServer({ root: directory, prefix: "/flowers" });
  assert.equal(request(server, "/").status, 404);
  assert.equal(request(server, "/flowers").headers.location, "/flowers/");
  assert.equal(request(server, "/flowers/").status, 200);
  assert.equal(request(server, "/flowers/js/app.js").status, 200);
  assert.equal(request(server, "/flowersevil/js/app.js").status, 404);
  assert.throws(() => createServer({ prefix: "/flowers/nested" }));
});

test("the local server rejects linked public and development files", (t) => {
  const directory = fixture(t);
  const server = createServer({ root: directory });
  const outside = fs.mkdtempSync(
    path.join(os.tmpdir(), "flowers-server-link-"),
  );
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const target = path.join(outside, "private.txt");
  fs.writeFileSync(target, "Do not expose this file.");
  fs.unlinkSync(path.join(directory, "notes.js"));
  fs.symlinkSync(target, path.join(directory, "notes.js"));
  assert.equal(request(server, "/notes.js").status, 404);
  fs.mkdirSync(path.join(directory, "dev"));
  fs.symlinkSync(target, path.join(directory, "dev/review.html"));
  assert.equal(request(server, "/dev/review.html").status, 404);
  fs.unlinkSync(path.join(directory, "dev/review.html"));
  fs.rmdirSync(path.join(directory, "dev"));
  fs.writeFileSync(
    path.join(outside, "review.html"),
    "Do not expose this directory.",
  );
  fs.symlinkSync(outside, path.join(directory, "dev"), "dir");
  assert.equal(request(server, "/dev/review.html").status, 404);
});

test("Pages uses dependency-free checks and never deploys a pull request", () => {
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/pages.yml"),
    "utf8",
  );
  const actions = [...workflow.matchAll(/uses:\s+([^\s]+)/g)].map(
    (match) => match[1],
  );
  assert.ok(actions.length > 0);
  assert.ok(
    actions.every((action) => /^actions\/[a-z-]+@[a-f0-9]{40}$/.test(action)),
  );
  assert.equal(
    workflow.match(
      /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/g,
    )?.length,
    2,
  );
  assert.match(workflow, /path: dist\/site/);
  assert.match(workflow, /needs: check/);
  assert.match(workflow, /persist-credentials: false/);
  assert.ok(!/pull_request_target|contents: write/.test(workflow));
  assert.match(workflow, /run: node tools\/stage\.cjs/);
  assert.ok(!/npm (?:ci|install|test|run test)/.test(workflow));
});
