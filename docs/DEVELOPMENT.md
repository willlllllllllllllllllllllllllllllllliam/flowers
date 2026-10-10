# Development

The root `index.html` is the actual website. It opens directly from the local file system without a build.
Edit the root files. Refresh the browser.

The [README](../README.md) covers the gift workflow. Use this guide for code changes, illustration review, and release checks.

## Optional maintainer checks

Use Node.js 22 or later for these tools. Run these commands from the repository folder:

```sh
npm ci
npm run test:maintainer
```

`npm test` runs the same suite. These checks help maintain the upstream project; they are not a requirement for publication.
The Pages workflow does not install these dependencies or run this suite.
Authors do not need Node.js or npm to edit notes. GitHub supplies Node.js for the release tool.
Use the committed lockfile for repeatable installs. Do not commit `node_modules/`.

## Terminal option

Fork the repository first. Replace `YOUR-USERNAME` below with your GitHub username.

```sh
git clone https://github.com/YOUR-USERNAME/flowers.git
cd flowers
```

[Write your notes](../README.md#write-your-notes) in `notes.js`. Open `index.html` in your browser.
Save your changes to Git:

```sh
git status
git add notes.js
git commit -m "Add a note"
git push origin main
```

Add other files by name if you change them. Follow the [Pages setup steps](../README.md#publish) for the first publication.

## Files

- `index.html` supplies the page elements and script order.
- `notes.js` supplies the author configuration.
- `styles.css` controls the page layout, fonts, colors, and responsive rules.
- `js/app.js` validates the notes and controls message navigation.
- `js/theme.js` controls light and dark mode.
- `js/gardens.js` defines the curated garden variations.
- `js/garden.js` constructs the illustration and manages its clock.
- `js/canvas-renderer.js` draws the garden efficiently on a canvas.
- `assets/` contains the local fonts, icon, and asset notices.
- `dev/review.html` provides the separate garden review interface.
- `tests/` contains optional maintainer checks.
- `tools/` contains the review server and release tools.
- `.github/workflows/` contains the Pages workflow.

## Principles for upstream contributions

These principles guide contributions to the original Flowers project. They do not restrict your own fork.
Change the design, behavior, and files to suit your gift.

- Keep `notes.js` as the only required author edit.
- Keep messages oldest-first in the file and newest-first on the page.
- Hide empty recipient and signature fields.
- Keep review controls out of the recipient's page.
- Keep local preview independent of a package install or server.
- Keep fonts and scripts local to the site.
- Keep the garden clear of the messages and arrows.
- Respect reduced-motion preferences.
- Keep V1 in the existing Git history.

Use relative asset paths. A personal fork usually lives below a repository path on GitHub Pages.
Keep the scripts compatible with a direct `file:` visit. Do not add a runtime fetch for the notes.

## Add or replace assets

The release tool uses an explicit file list in `tools/public-files.cjs`. It does not publish entire directories automatically.
This keeps private files and development tools out of the website.

1. Put a new font or image in `assets/`.
2. Put a new script in `js/`.
3. Add each file to the existing list in `tools/public-files.cjs`.
4. Update the HTML, CSS, or JavaScript reference to use the file.
5. Add any required license notice to the file list.
6. Remove superseded entries when no page or script uses them.
7. Preview your changes.

Use paths relative to the repository root, such as `assets/my-font.woff2`, `assets/photo.webp`, or `js/my-script.js`.
Do not add a leading slash. Keep a comma between entries in the list.
Match the filename's upper-case and lower-case letters. GitHub Pages treats them as different characters.
Keep required notices for every asset that remains in use.

For a font, update its `@font-face` rule in `styles.css`. Then use its family name in `--message-font`.
For an image, update its HTML or CSS reference. For a script, add or update its `<script>` element in `index.html`.

The release tool also accepts HTTPS asset URLs. Do not put those URLs in the local file list.
External assets need a network connection, including during local preview. Self-hosted assets keep the default offline behavior.
The preview server permits HTTPS assets. External services can still restrict requests from a local page.

## Review all gardens

Start the local review server:

```sh
node tools/serve.cjs
```

Open [the development review page](http://127.0.0.1:4180/dev/review.html).
The review page provides fixed garden choices for repeatable checks. The normal website chooses a garden without a visible selector.

Press `Ctrl+C` in the terminal when you finish. The review server listens on loopback, not the local network.

## Prepare the website files

Run the release tool with Node.js 22 or later:

```sh
node tools/stage.cjs
```

The tool copies the allowed website files to `dist/site/` without a compile step.
The Pages workflow publishes this directory, not the repository root.
The tool uses only built-in Node.js modules. It does not need `npm ci`, `npm test`, or development dependencies.
It checks notes, script syntax, and common HTML/CSS asset references. It does not check remote availability or JavaScript import paths.
Preview your changes before publication. A successful file check does not replace a browser check.

The published files contain the page, notes, styles, runtime scripts, fonts, icon, and required license notices.
The output excludes `dev/`, `tests/`, `tools/`, Git files, and development dependencies.

Edit the root files, not the generated copies. Do not commit `dist/site/`.
Run the tool again after a source change.

## Suggested upstream release checks

Use these checks before an upstream release. Adapt them for your fork; the Pages workflow does not require the maintainer suite.

### Notes and local preview

1. Make a fresh copy without `node_modules/` or earlier generated files.
2. Open `index.html` directly in a browser.
3. Confirm that the two supplied messages match the original examples.
4. Replace the notes with a short test message.
5. Add a second message at the end.
6. Confirm that the page shows the second message first.
7. Check both arrows, empty names, and visible names.
8. Check quotes, line breaks, accents, emoji, and a long note on a narrow screen.

Use a disposable copy to test a missing comma. Confirm that the page gives a useful configuration error.
Restore valid notes after the test.

### Artwork and device checks

- Review every garden in light mode and dark mode.
- Review the start, middle, and end of each animation.
- Check reduced motion.
- Check narrow phone and wide laptop layouts for overlap with the messages or arrows.
- Test an actual phone before publication.

A narrow desktop window does not measure phone animation performance.

### Release files and Pages paths

1. Run the automated tests.
2. Prepare `dist/site/`.
3. Inspect every file in that output.
4. Open the output's `index.html` directly.

Test a served copy below `/flowers/`. Stop the default review server.
Run:

```sh
node tools/serve.cjs --prefix=/flowers
```

Open `http://127.0.0.1:4180/flowers/`. This checks the relative paths that GitHub Pages needs.
Stop the server after the check.

### Publication

The **Flowers Pages** workflow prepares the selected files on pull requests. It deploys pushes to `main` and manual runs on `main`.
The workflow runs `node tools/stage.cjs`. It does not install packages or run the maintainer suite.
Review the final notes before a push to that branch. Never include personal test notes in a release.

Set the repository's Pages source to **GitHub Actions**. Restrict the `github-pages` environment to the intended release branch.
Keep the release output allowlist narrow.

## Preserve V1

The original V1 tip is commit `24a513678619f823cb377d0260853dd6ea9c6aa4`.
The local `flowers-v1` tag marks that commit. The release branch continues from V1, so the old files remain in its ancestry.
Existing forks retain their own files and history when this repository receives an update.

Do not replace the repository or rewrite its history. Do not force-push a new root commit.
Retain the original license and tutorial credits.

The local tag does not appear on GitHub until a maintainer publishes it.
Publish that exact tag with the approved V2 release. Do not use a broad command that pushes every local tag.
After publication, verify that GitHub shows the tag at the original commit.

The [live demo](https://willlllllllllllllllllllllllllllllllliam.github.io/flowers/) shows V1 until the V2 release deploys.
Verify that the demo shows V2 after the release.

For a separate local V1 checkout, use:

```sh
git worktree add ../flowers-v1 24a513678619f823cb377d0260853dd6ea9c6aa4
```

Choose an unused folder path. This leaves the current V2 files in place.

## Asset terms

The MIT license covers the project code. Fonts carry separate terms under `assets/`.
Keep those notices with the fonts in the release output. Do not describe the font files as MIT-licensed.
Review the relevant font terms before a new use, especially a commercial use.
