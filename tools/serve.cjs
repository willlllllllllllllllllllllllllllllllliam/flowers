"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const publicFiles = require("./public-files.cjs");
const { regularFile } = require("./stage.cjs");
const projectRoot = path.resolve(__dirname, "..");
const developmentFiles = ["dev/review.html", "dev/review.js", "dev/review.css"];
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

function createServer({ root = projectRoot, prefix = "" } = {}) {
  if (prefix && !/^\/[a-zA-Z0-9_-]+$/.test(prefix))
    throw new Error("Use one path segment for the preview prefix.");
  return http.createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'self'; form-action 'none'",
    );
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      response.writeHead(405).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url, "http://127.0.0.1").pathname,
      );
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (prefix) {
      if (pathname === prefix) {
        response.writeHead(302, { Location: `${prefix}/` }).end();
        return;
      }
      if (!pathname.startsWith(`${prefix}/`)) {
        response.writeHead(404).end();
        return;
      }
      pathname = pathname.slice(prefix.length);
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    try {
      let filename;
      if (publicFiles.includes(relative))
        filename = regularFile(root, relative);
      else if (developmentFiles.includes(relative)) {
        const directory = path.join(root, "dev");
        const stat = fs.lstatSync(directory);
        filename = path.join(root, relative);
        const file = fs.lstatSync(filename);
        if (
          stat.isSymbolicLink() ||
          !stat.isDirectory() ||
          file.isSymbolicLink() ||
          !file.isFile()
        )
          throw new Error("Invalid development file.");
      } else {
        response.writeHead(404).end();
        return;
      }
      const bytes = fs.readFileSync(filename);
      response.writeHead(200, {
        "Content-Type":
          types[path.extname(filename)] || "text/plain; charset=utf-8",
        "Content-Length": bytes.length,
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
}

module.exports = { createServer };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !args[0].startsWith("--prefix="))) {
    console.error("Use: node tools/serve.cjs [--prefix=/flowers]");
    process.exitCode = 1;
  } else {
    const prefix = args[0]?.slice("--prefix=".length) || "";
    const server = createServer({ prefix });
    server.on("error", (error) => {
      console.error(`The preview cannot start: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(4180, "127.0.0.1", () =>
      console.log(
        `Open http://127.0.0.1:4180${prefix}/ (Ctrl+C stops the preview).`,
      ),
    );
    const stop = () => {
      server.close();
      server.closeAllConnections();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
}
