"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const publicFiles = require("./public-files.cjs");
const projectRoot = path.resolve(__dirname, "..");

// Reject links at every path component, not just at the final file.
function regularFile(root, relative) {
  if (!publicFiles.includes(relative))
    throw new Error(`The file is not public: ${relative}`);
  let current = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink())
      throw new Error(`Do not publish a symbolic link: ${relative}`);
    if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error(`Expected a regular file: ${relative}`);
    }
  }
  return current;
}

function validateNotes(source) {
  const context = vm.createContext(
    { window: {} },
    { codeGeneration: { strings: false, wasm: false } },
  );
  new vm.Script(source, { filename: "notes.js" }).runInContext(context, {
    timeout: 1000,
  });
  const value = context.window.FLOWERS_NOTES;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Set window.FLOWERS_NOTES in notes.js.");
  }
  for (const field of ["to", "from"]) {
    if (typeof value[field] !== "string")
      throw new Error(`The ${field} field in notes.js must be text.`);
  }
  if (!Array.isArray(value.messages) || value.messages.length < 1) {
    throw new Error("Add at least one message in notes.js.");
  }
  for (const [index, message] of value.messages.entries()) {
    if (typeof message !== "string" || !message.trim()) {
      throw new Error(`Message ${index + 1} in notes.js must contain text.`);
    }
  }
}

function validateSources(root = projectRoot) {
  const contents = new Map(
    publicFiles.map((relative) => [
      relative,
      fs.readFileSync(regularFile(root, relative)),
    ]),
  );
  for (const [relative, bytes] of contents) {
    if (relative.endsWith(".ttf")) {
      if (bytes.length < 100)
        throw new Error(`The font file is incomplete: ${relative}`);
      continue;
    }
    const source = bytes.toString("utf8");
    if (
      /\/Users\/[^/]+\/|\/home\/[^/]+\/|[A-Z]:\\Users\\|file:\/\//i.test(source)
    ) {
      throw new Error(`Remove the local machine path from ${relative}.`);
    }
    if (relative.endsWith(".js")) new vm.Script(source, { filename: relative });
  }
  validateNotes(contents.get("notes.js").toString("utf8"));
  const checkResource = (resource, file) => {
    if (resource.startsWith("#") || resource.startsWith("data:")) return;
    const relative = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), resource),
    );
    if (/^(?:[a-z]+:|\/|\\)/i.test(resource) || !contents.has(relative)) {
      throw new Error(`Use a relative public asset in ${file}: ${resource}`);
    }
  };
  for (const [, resource] of contents
    .get("index.html")
    .toString("utf8")
    .matchAll(/<(?:script|link|img)\b[^>]*?(?:src|href)=["']([^"']+)["']/gi)) {
    checkResource(resource, "index.html");
  }
  for (const match of contents
    .get("styles.css")
    .toString("utf8")
    .matchAll(
      /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s)]*))\s*\)/gi,
    )) {
    const resource = match[1] ?? match[2] ?? match[3];
    checkResource(resource, "styles.css");
  }
  return contents;
}

function stageSite(root = projectRoot) {
  const contents = validateSources(root);
  const dist = path.join(root, "dist");
  const destination = path.join(dist, "site");
  // Check both output directories before any file operation.
  for (const target of [dist, destination]) {
    if (
      fs.existsSync(target) ||
      fs.lstatSync(target, { throwIfNoEntry: false })
    ) {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(`Expected a normal output directory: ${target}`);
    }
  }
  fs.mkdirSync(dist, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(dist, ".site-"));
  try {
    for (const [relative, bytes] of contents) {
      const target = path.join(temporary, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: "wx" });
    }
    fs.writeFileSync(path.join(temporary, ".nojekyll"), "", { flag: "wx" });
    // This exact directory contains generated files only. Rebuild it to remove stale files.
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return {
    destination,
    files: [...publicFiles, ".nojekyll"],
    bytes: [...contents.values()].reduce((sum, value) => sum + value.length, 0),
  };
}

module.exports = { regularFile, validateNotes, validateSources, stageSite };
if (require.main === module) {
  try {
    const result = stageSite();
    console.log(
      `Prepared ${result.files.length} public files (${result.bytes.toLocaleString()} bytes) in dist/site.`,
    );
  } catch (error) {
    console.error(`The site is not ready: ${error.message}`);
    process.exitCode = 1;
  }
}
