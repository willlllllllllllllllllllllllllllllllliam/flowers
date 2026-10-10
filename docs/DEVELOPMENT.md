# Development

The root `index.html` is the actual website. It works directly from the local file system.
There is no separate source copy that authors must compile. Change the root files. Refresh the browser.

The [README](../README.md) covers the gift workflow. Use this guide for code changes, illustration review, and release checks.

## Keep the gift simple

- Keep `notes.js` as the only required author edit.
- Keep the newest message first on the page.
- Keep the oldest message first in the file.
- Hide empty recipient and signature fields.
- Keep review controls out of the recipient's page.
- Keep local preview independent of a package install or server.
- Keep fonts and scripts local to the site.
- Keep the garden clear of the messages and arrows.
- Respect reduced-motion preferences.
- Keep V1 in the existing Git history.

## Code map

- `index.html` supplies the page elements and script order.
- `notes.js` supplies the author configuration.
- `styles.css` controls the page layout, fonts, colors, and responsive rules.
- `js/app.js` validates the notes and controls message navigation.
- `js/theme.js` controls light and dark mode.
- `js/gardens.js` defines the curated garden variations.
- `js/garden.js` constructs the illustration and manages its clock.
- `js/canvas-renderer.js` draws the garden efficiently on a canvas.
- `dev/review.html` provides the separate garden review interface.
- `tools/stage.cjs` prepares the explicit set of files for publication.

Use relative asset paths. A personal fork usually lives below a repository path on GitHub Pages.
Keep the scripts compatible with a direct `file:` visit. Do not add a runtime fetch for the notes.

## Check the source

Use Node.js 22 or later. Run these commands from the repository folder:

```sh
npm ci
npm test
```

The browser does not use these development dependencies. Authors do not need to run these commands to edit notes.
Use the committed lockfile for repeatable dependency installs. Do not commit `node_modules/`.

## Review all gardens

Start the local review server:

```sh
node tools/serve.cjs
```

Open [the development review page](http://127.0.0.1:4180/dev/review.html).
The review page provides fixed garden choices for repeatable checks. The normal website chooses a garden without a visible selector.

Review both themes. Review the start, middle, and end of each animation.
Check a narrow phone layout and a wide laptop layout. Check the message area for illustration overlap.

Press `Ctrl+C` in the terminal when you finish. The review server listens on loopback, not the local network.

## Prepare the website files

Run the release tool:

```sh
node tools/stage.cjs
```

The tool writes `dist/site/`. It copies the allowed website files without a compile step.
The Pages workflow publishes this directory. It does not publish the repository root.

The published files contain the page, notes, styles, runtime scripts, fonts, icon, and required license notices.
The output excludes `dev/`, `tests/`, `tools/`, Git files, and development dependencies.

Treat `dist/site/` as generated output. Edit the root files, not the copies in that directory.
Do not commit that output. Run the tool again after a source change.

## Check the beginner workflow before a release

1. Make a fresh copy without `node_modules/` or earlier generated files.
2. Open `index.html` directly in a browser.
3. Confirm that the two supplied messages match the original examples.
4. Replace the notes with a short test message.
5. Add a second message at the end.
6. Confirm that the second message appears first.
7. Check both arrows.
8. Check empty names and visible names.
9. Check quotes, line breaks, accents, and emoji.
10. Check a long note on a narrow screen.
11. Check a missing comma in a disposable copy.
12. Confirm that the page gives a useful configuration error.
13. Restore valid notes.
14. Check light mode and dark mode.
15. Check reduced motion.
16. Review the garden variations with the development page.
17. Run the automated tests.
18. Prepare `dist/site/`.
19. Inspect every file in that output.
20. Open the output's `index.html` directly.

Test a served copy below `/flowers/`. Stop the default review server. Run:

```sh
node tools/serve.cjs --prefix=/flowers
```

Open `http://127.0.0.1:4180/flowers/`. This checks the relative paths that GitHub Pages needs.
Test an actual phone before publication. A narrow desktop window does not measure phone animation performance.

## Publish deliberately

The **Flowers Pages** workflow tests pull requests. It deploys pushes to `main` and manual runs on `main`.
Review the final notes before a push to that branch. Never include personal test notes in a release.

Set the repository's Pages source to **GitHub Actions**. Restrict the `github-pages` environment to the intended release branch.
Keep the release output allowlist narrow.

## Preserve V1

The original V1 tip is commit `24a513678619f823cb377d0260853dd6ea9c6aa4`.
The local release preparation marks that commit with the `flowers-v1` tag.
The release branch continues from V1, so the old files remain in its ancestry.

Do not replace the repository or rewrite its history. Do not force-push a new root commit.
Retain the original license and tutorial credits.

The local tag does not appear on GitHub until a maintainer publishes it.
Publish that exact tag with the approved V2 release. Do not use a broad command that pushes every local tag.
After publication, verify that GitHub shows the tag at the original commit.

For a separate local V1 checkout, use:

```sh
git worktree add ../flowers-v1 24a513678619f823cb377d0260853dd6ea9c6aa4
```

Choose an unused folder path. This leaves the current V2 files in place.

## Asset terms

The MIT license covers the project code. Fonts carry separate terms under `assets/`.
Keep those notices with the fonts in the release output. Do not describe the font files as MIT-licensed.
Review the relevant font terms before a new use, especially a commercial use.
