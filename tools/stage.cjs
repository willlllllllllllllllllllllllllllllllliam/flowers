"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const publicFiles = require("./public-files.cjs");
const projectRoot = path.resolve(__dirname, "..");

// Reject links at every path component, not just at the final file.
function regularFile(root, relative) {
  if (!publicFiles.includes(relative))
    throw new Error(`The file is not public: ${relative}`);
  if (
    typeof relative !== "string" ||
    /[\\:]/.test(relative) ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(
      `Use a path inside the project in tools/public-files.cjs: ${relative}`,
    );
  }
  let current = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat)
      throw new Error(
        `Missing public file: ${relative}. Restore it or update tools/public-files.cjs.`,
      );
    if (stat.isSymbolicLink())
      throw new Error(`Do not publish a symbolic link: ${relative}`);
    if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error(`Expected a regular file: ${relative}`);
    }
  }
  return current;
}

function validateScript(source, filename, module = false) {
  if (module !== true) {
    try {
      new vm.Script(source, { filename });
      return;
    } catch (error) {
      // An unclassified file can be a dependency of an ES module.
      if (module === false) throw error;
    }
  }
  // Check module syntax without imports, execution, or extra dependencies.
  const result = spawnSync(
    process.execPath,
    ["--check", "--input-type=module"],
    {
      input: source,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Invalid module in ${filename}: ${result.stderr.trim()}`);
}

function attribute(source, name) {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\x60]+))`,
    "i",
  ).exec(source);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
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
  validateNotes(contents.get("notes.js").toString("utf8"));
  const checkResource = (resource, file) => {
    if (/^(?:#|data:|https:\/\/)/i.test(resource)) return null;
    if (/^(?:[a-z]+:|\/|\\)/i.test(resource)) {
      throw new Error(
        `Use a relative path or HTTPS asset in ${file}: ${resource}`,
      );
    }
    let pathname;
    try {
      pathname = decodeURIComponent(resource.split(/[?#]/, 1)[0]);
    } catch {
      throw new Error(`Invalid asset URL in ${file}: ${resource}`);
    }
    const relative = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), pathname),
    );
    if (!contents.has(relative)) {
      throw new Error(
        `Missing public asset in ${file}: ${resource}. Add ${relative} to tools/public-files.cjs.`,
      );
    }
    return relative;
  };
  const scriptModes = new Map();
  for (const [relative, bytes] of contents) {
    if (/\.html$/i.test(relative)) {
      const source = bytes.toString("utf8").replace(/<!--[\s\S]*?-->/g, "");
      for (const [, attributes, body] of source.matchAll(
        /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi,
      )) {
        const type = attribute(attributes, "type")?.toLowerCase();
        if (
          type &&
          !["module", "text/javascript", "application/javascript"].includes(
            type,
          )
        )
          continue;
        const resource = attribute(attributes, "src");
        if (resource) {
          const filename = checkResource(resource, relative);
          if (filename) scriptModes.set(filename, type === "module");
        } else validateScript(body, relative, type === "module");
      }
      // HTML inside script or style text is not a page element.
      const markup = source.replace(
        /<(script|style)\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/\1\s*>/gi,
        "",
      );
      for (const [, tag, attributes] of markup.matchAll(
        /<(link|img|audio|video|source)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi,
      )) {
        const resource = attribute(
          attributes,
          tag.toLowerCase() === "link" ? "href" : "src",
        );
        if (resource) checkResource(resource, relative);
      }
    } else if (/\.css$/i.test(relative)) {
      const source = bytes.toString("utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const match of source.matchAll(
        /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s)]*))\s*\)/gi,
      ))
        checkResource(match[1] ?? match[2] ?? match[3], relative);
      for (const [, resource] of source.matchAll(
        /@import\s+["']([^"']+)["']/gi,
      ))
        checkResource(resource, relative);
    }
  }
  for (const [relative, bytes] of contents) {
    if (/\.(?:mjs|js)$/i.test(relative))
      validateScript(
        bytes.toString("utf8"),
        relative,
        scriptModes.get(relative) ?? (relative.endsWith(".mjs") ? true : null),
      );
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
