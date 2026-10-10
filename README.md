# Flowers

A small website for someone you love. Leave a note for a birthday, an anniversary, or an ordinary day.

An ink garden draws itself below your notes. Make your own copy. Change it to suit the person you love. Return later with another note.

[Live demo](https://willlllllllllllllllllllllllllllllllliam.github.io/flowers/)

[Set up](#set-up) · [Customize](#customize) · [Publish](#publish) · [Help](#help)

You do not need code experience. The site needs no build step, package install, or local server.

> **Privacy:** Treat hosted notes as public, even with an unlisted link. Deleted notes can remain in Git history. Do not include sensitive information.
> See [GitHub's privacy warning](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

<a id="set-up"></a>

## Make your own

### 1. Copy the project

1. Sign in to [GitHub](https://github.com/).
2. Open the [Flowers repository](https://github.com/willlllllllllllllllllllllllllllllllliam/flowers).
3. Click **Fork**.
4. Create the fork under your own account.
5. Install [GitHub Desktop](https://desktop.github.com/) if you do not have it.
6. Sign in to GitHub Desktop.
7. Choose **File > Clone Repository**.
8. Select your fork, not the original Flowers repository.
9. Choose a folder on your computer.
10. Click **Clone**.

If Desktop asks how you will use the fork, select **For my own purposes**.
GitHub's [clone guide](https://docs.github.com/en/desktop/adding-and-cloning-repositories/cloning-and-forking-repositories-from-github-desktop) includes screenshots.
For command-line use, see the [terminal instructions](docs/DEVELOPMENT.md#terminal-option).

<a id="write-your-notes"></a>

### 2. Write your notes

Open `notes.js` in a plain-text editor, such as VS Code or Notepad. This is the only file you must edit.
Do not use Word or Pages. In TextEdit, choose **Format > Make Plain Text**. Turn off smart quotes.

Replace the two example messages with your own. Here is a complete configuration:

```js
window.FLOWERS_NOTES = {
  to: "Alex,",
  from: "Love, Sam",
  messages: [
    "Happy birthday.\nI'm glad I get to know you.",
    "You said, \"Let's go.\"\nThat is still my favorite memory.",
    "No special occasion today.\nJust this: I love you. ♡"
  ]
};
```

Keep the oldest note first in the file. The page shows the last note first: “No special occasion today” in this example.
Dates in the text do not control the order.

The `to` field adds a name above the message. The `from` field adds a signature below it.
Leave either field as `""` to hide it. Both fields start empty.

- Keep each message inside straight double quotes: `"message"`.
- Put a comma between messages. Keep the square brackets around the list.
- Use `\n` for a line break.
- Use `\"` for a double quote inside a message. Apostrophes need no change.

<details>
<summary>More text options</summary>

Use `\\` for a backslash. Write accents, other languages, and emoji directly. Save the file as UTF-8.
The browser uses a fallback font for characters that Walkway does not include.
Notes use plain text, not HTML or Markdown.

</details>

<a id="preview-your-site"></a>

### 3. Preview your site

1. Save `notes.js`.
2. Open the project folder in Finder or File Explorer.
3. Double-click `index.html`.
4. Check both arrows if you have at least two notes.
5. Check the sun or moon button.

Keep the project folder together. After an edit, save the file. Refresh the browser to see the change.
Long notes can make the page scroll. Check your notes on a phone after publication.

<a id="save-to-github"></a>

### 4. Save to GitHub

1. Return to GitHub Desktop.
2. Review the changed files.
3. Confirm that no private files appear in the list.
4. Enter a short summary, such as `Add birthday notes`.
5. Click **Commit to main**.
6. Click **Push origin**.

A commit saves a version on your computer. A push sends that version to your fork.
Do not send personal notes to the original project through a pull request.

<a id="publish"></a>

### 5. Publish with GitHub Pages

1. Open your fork on GitHub.
2. Open **Settings > Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Open the **Actions** tab.
5. Enable workflows if GitHub asks you to enable them for the fork.
6. Select **Flowers Pages**.
7. Click **Run workflow**.
8. Select `main`.
9. Start the run.

The workflow already exists. You do not need a suggested template.
It copies the selected website files without a package install or test suite. GitHub supplies Node.js for this step.
Wait for the run to succeed. Find your site address under **Settings > Pages**.
Later pushes to `main` update the site automatically.

### Add a note later

Add the new note at the bottom of `messages`. Keep a comma between notes.
Repeat the [preview](#preview-your-site) and [GitHub](#save-to-github) steps above.

## Customize

Make the design your own. The defaults are a starting point, not requirements for your fork.
Start with a small change. Keep a saved version that you can return to.

- **Title and heading:** Edit `<title>` or the `flowers` text in `index.html`. Keep the `id` attributes unchanged.
- **Day colors:** Edit `--paper` and `--ink` in `styles.css`.
- **Night colors:** Edit those variables in the `[data-theme="dark"]` section.
- **Message text:** Edit `--message-font`, `--message-size`, or `--message-line-height` near the top of `styles.css`. Keep units such as `px` for size.

Put new fonts or images in `assets/`. Put new scripts in `js/`.
Add each new file to `tools/public-files.cjs`, with a path such as `assets/my-font.woff2` or `js/my-script.js`.
Update the page or CSS to use the file. Keep the file's required license notices.
Remove old list entries when you no longer use their files. The publisher does not include whole directories automatically.
See [the asset guide](docs/DEVELOPMENT.md#add-or-replace-assets) for details, including external assets.

For code changes and garden reviews, see [the developer guide](docs/DEVELOPMENT.md).

## Help

<details>
<summary>The page reports a notes error</summary>

Check the quotes, commas, brackets, and braces in `notes.js`. Keep `window.FLOWERS_NOTES =` before the configuration.
Use at least one nonempty message. Keep `to` and `from` as text.
Save your words elsewhere before you restore the [complete example](#write-your-notes).

</details>

<details>
<summary>My changes do not appear</summary>

Save the file. Confirm that the browser shows `index.html` from the same folder. Refresh the page.
For the public site, check that the latest Actions run succeeded. Try a private browser window if the page still looks old.

</details>

<details>
<summary>The file is called notes.js.txt</summary>

Show file extensions in Finder or File Explorer. Rename the file to exactly `notes.js`.
Do not let the editor add `.txt` when you save it.

</details>

<details>
<summary>The page has no font, styles, or garden</summary>

Keep `assets/`, `js/`, `notes.js`, and `styles.css` beside `index.html`.
If you downloaded a ZIP, extract it before you open the page.

</details>

<details>
<summary>GitHub Pages shows a 404 error</summary>

Use the address under **Settings > Pages**. Confirm that Pages uses **GitHub Actions**, not a branch folder.
Check the Actions tab for a successful deployment.
See [GitHub's Pages guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) if you need more help.

</details>

## V1

The [original version](https://github.com/willlllllllllllllllllllllllllllllllliam/flowers/tree/24a513678619f823cb377d0260853dd6ea9c6aa4) remains in Git history.
Existing forks keep their files and history. V2 does not change them.

## Credits and licenses

Creative Coderie's [video tutorial](https://www.youtube.com/watch?v=r_3D8zDci8c) and [tutorial code](https://github.com/hbyhadeel/GenArtTutorials/tree/main/Loading_Text_Files_Tutorial) helped inspire V1.
Zancan's botanical ink work inspired V2. The gardens use original code, not copied artwork.

The code uses the [MIT License](LICENSE). Fonts have [separate terms and credits](THIRD_PARTY_NOTICES.md).
Issues and pull requests are welcome. Keep examples free of private notes.
