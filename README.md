# Flowers

A small website for someone you love. Leave a note for a birthday, an anniversary, or an ordinary day.

An ink garden draws itself across the page. Your newest message appears first. The arrows open older messages.

Make your own copy. Write your notes. Change the design if you like. Return later to add something new.

[Live demo (V1 until this release is published)](https://willlllllllllllllllllllllllllllllllliam.github.io/flowers/)

You do not need prior code experience. You need a browser, a plain-text editor, and a little time.
The site needs no account system, installation, build command, or local server. Open `index.html` to try it.

## Before you write a personal note

Treat every hosted note as public. Someone can read the notes in `notes.js`, even without the navigation arrows.
An unlisted address does not make the site private. GitHub Pages sites are public, even with many private-repository configurations.
See [GitHub's privacy warning](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

A public repository also exposes its files and Git history. A deletion from the current file does not remove a note from earlier commits.
Do not put passwords, addresses, or other sensitive details here.

## Make your own version

This path uses GitHub Desktop. You edit the files on your computer, then publish your own copy.

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

### 2. Write your notes

Open the project folder in a plain-text editor, such as VS Code or Notepad. Do not use Word or Pages.
If you use TextEdit on a Mac, select **Format > Make Plain Text** first. Turn off smart quotes.

Open `notes.js`. This is the only file you must edit.

The supplied file contains the two original example messages:

```js
window.FLOWERS_NOTES = {
  to: "",
  from: "",
  messages: [
    "If you ask me, I bet they'd probably really like it if you do.",
    "This website is open source, and you can make your own version for a loved one."
  ]
};
```

Replace those messages with your own. Keep the oldest message first in the file.
Add each new message at the bottom of the list. The page starts with the last message in that list.
Dates in the message text do not change this order.

Here is a complete example:

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

In this example, “No special occasion today” appears first.

- Put a comma between messages. Keep the square brackets around the list.
- Put each message inside straight double quotes: `"message"`.
- Use `\n` for a line break inside a message.
- Use `\"` for a double quote inside a message.
- Use `\\` for a literal backslash.
- Keep apostrophes as they are: `I'm`, `you'd`, `we'll`.
- Write accents, other languages, and emoji directly. Save the file as UTF-8.
- Write plain text. The page does not interpret HTML or Markdown in your notes.

The font does not include every character. Your browser uses a fallback font for missing characters.

The `to` field adds a name above the message. The `from` field adds a signature below it.
Set either field to `""` to hide it. Both fields start empty.

### 3. See your version

1. Save `notes.js`.
2. Open the project folder in Finder or File Explorer.
3. Double-click `index.html`.
4. Check both arrows if you have at least two notes.
5. Check the sun or moon button.

Keep `index.html`, `notes.js`, `styles.css`, `js/`, and `assets/` together. Do not move `index.html` out of the project folder.
After each edit, save the file. Refresh the browser to see the change.

The page chooses a garden on each visit. It avoids the previous garden when browser storage works.
Long notes can make the page scroll. Check long notes on your phone after publication.

### 4. Save your changes to GitHub

1. Return to GitHub Desktop.
2. Review the changed files.
3. Confirm that no private files appear in the list.
4. Enter a short summary, such as `Add birthday notes`.
5. Click **Commit to main**.
6. Click **Push origin**.

A commit saves a version on your computer. A push sends that version to your GitHub fork.
Use your own fork for your notes. Do not send personal notes to the original project through a pull request.

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

The repository already includes the workflow. You do not need to add a suggested template.
The workflow publishes only the website files and license notices. It excludes the review tools, tests, and development guides.

Wait for the run to succeed. Find the site address under **Settings > Pages**.
The address usually follows this pattern: `https://YOUR-USERNAME.github.io/flowers/`.
Use the actual address from your repository settings.

Later pushes to `main` update the site automatically. See [GitHub's Pages setup guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) if the settings differ.

### 6. Leave another note later

1. Open your local `notes.js`.
2. Check that a comma follows the previous last message.
3. Add your new message below it.
4. Save the file.
5. Refresh your local preview.
6. Commit the edit in GitHub Desktop.
7. Push it to your fork.

Your new message appears first after the deployment completes. The older notes remain available through the arrows.

## Make the design your own

The files contain comments beside common edits. Start with a small change. Keep a saved version that you can return to.

- **Browser-tab title:** Change the text inside `<title>` in `index.html`.
- **Page heading:** Change the `flowers` text beside the theme button in `index.html`.
- **Names and notes:** Edit `notes.js`.
- **Paper and ink colors:** Edit `--paper` and `--ink` in `styles.css`.
- **Night colors:** Edit those variables in the `[data-theme="dark"]` section.
- **Message font:** Edit `--message-font` near the top of `styles.css`.
- **Message size:** Edit `--message-size` in that same section. Keep a unit such as `px`.
- **Space between text lines:** Edit `--message-line-height` in that same section.
- **Layout:** Edit `styles.css`. Check a narrow phone screen as well as a laptop.

Keep the `id` attributes in `index.html`. The code uses those names to find the page elements.
The theme button restarts the illustration with the new ink color. Reduced-motion preferences limit the animation.

For deeper changes, see [the development guide](docs/DEVELOPMENT.md). The garden review tools stay separate from the gift itself.

## If something does not work

### The page reports a notes error

Check the quotes, commas, square brackets, and braces in `notes.js`.
Keep `window.FLOWERS_NOTES =` at the start of the assignment.
Use at least one nonempty message. Keep `to` and `from` as text, even when they are empty.

Copy the complete example above into `notes.js` if you need a known-good starting point.
Save your own text elsewhere first.

### My changes do not appear

Save the file in your editor. Confirm that the browser shows `index.html` from the same folder.
Refresh the page. For the public site, check that the latest Actions run succeeded.
Try a private browser window if the public page still looks old.

### The file is called `notes.js.txt`

Show file extensions in Finder or File Explorer. Rename the file to exactly `notes.js`.
Do not let the text editor add `.txt` when you save it.

### The page has no font, styles, or garden

Keep the whole project folder together. Check that `assets/`, `js/`, and `styles.css` sit beside `index.html`.
If you downloaded a ZIP, extract it before you open the page.

### Pages shows a 404 error

Check **Settings > Pages** for the correct address. Use the repository name in the address when GitHub includes it.
Check the Actions tab for a successful deployment. Confirm that Pages uses **GitHub Actions**, not a branch folder.

## Terminal option

Fork the repository first. Replace `YOUR-USERNAME` below with your GitHub username.

```sh
git clone https://github.com/YOUR-USERNAME/flowers.git
cd flowers
```

Edit `notes.js` in your text editor. Open `index.html` in your browser.
Then save your changes:

```sh
git status
git add notes.js
git commit -m "Add a note"
git push origin main
```

Add other files by name if you change them. Use the Pages setup steps above to publish the first version.
Node.js and npm are only for the optional development tools. Your gift does not need them.

## Files

- `index.html` - The page structure and browser-tab title.
- `notes.js` - Your messages, optional recipient, and optional signature.
- `styles.css` - The fonts, colors, spacing, and phone layouts.
- `js/` - The message controls, theme control, and illustration code.
- `assets/` - The fonts, icon, and asset notices.
- `dev/` - The local review tools for developers.
- `tests/` and `tools/` - The checks and release tools.
- `.github/workflows/` - The automated checks and Pages deployment.

## The original version

V1 remains in this repository's Git history. V2 continues that history rather than replacing it with a new repository.
You can [browse the original V1 revision](https://github.com/willlllllllllllllllllllllllllllllllliam/flowers/tree/24a513678619f823cb377d0260853dd6ea9c6aa4).
The local `flowers-v1` tag also marks that revision. The tag is not on GitHub yet; it will accompany the V2 release.
Existing forks keep their own files and history. They do not change when this repository receives an update.

## Credits and licenses

The original Flowers version drew inspiration and help from Creative Coderie's tutorial:

- [Video tutorial](https://www.youtube.com/watch?v=r_3D8zDci8c)
- [Tutorial repository](https://github.com/hbyhadeel/GenArtTutorials/tree/main/Loading_Text_Files_Tutorial)

Zancan's botanical ink work inspired the art direction for V2. The project uses its own code-generated gardens, not copied artwork.

The project code uses the [MIT License](LICENSE). The fonts have separate terms in `assets/`.
See [the asset notices](THIRD_PARTY_NOTICES.md) for the font sources and terms.
Do not assume the code license covers the fonts. Review those terms before reuse, redistribution, or commercial use.

Issues and pull requests are welcome. Please keep examples free of private notes.
