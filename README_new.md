# Sorta

A personal notes app that works on laptop and phone, synced through GitHub, for free.

- **App code** lives in the public repo `sorta` and is served by GitHub Pages.
- **Your notes** live as Markdown files in a separate **private** repo `sorta-data` (`notes/*.md`).
  Every save is a commit, so you get full history for free.

## One-time setup

1. **Create a GitHub account** (if using a new one).

2. **Create the data repo:** New repository → name `sorta-data` → **Private** →
   tick "Add a README file" → Create.

3. **Create an access token** that can only touch that repo:
   Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
   - Repository access: **Only select repositories** → `sorta-data`
   - Permissions → Repository permissions → **Contents: Read and write**
   - Expiration: your choice (you'll re-enter it in the app when it expires)

   Copy the token; you'll paste it into the app on each device.

4. **Publish the app:** create a **public** repo named `sorta`, then from this folder:
   ```sh
   git init && git add . && git commit -m "Sorta v0"
   git branch -M main
   git remote add origin https://github.com/USERNAME/sorta.git
   git push -u origin main
   ```
   In the `sorta` repo: Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)` → Save.
   After a minute it's live at `https://USERNAME.github.io/sorta/`.

5. **Open it and connect:** enter your username, `sorta-data`, and the token.

## Laptop

- **Terminal:** add the command to your PATH and tell it your URL:
  ```sh
  echo 'export PATH="$HOME/Documents/sorta/bin:$PATH"' >> ~/.zshrc
  mkdir -p ~/.config/sorta && echo 'https://USERNAME.github.io/sorta/' > ~/.config/sorta/url
  ```
  Then run `sorta`. Use `sorta --local` to try changes before pushing them.
- **App icon:** open the URL in Chrome → ⋮ menu → Cast, save, and share → **Install page as app**
  (or in Safari: File → **Add to Dock**).

## Phone

Open the URL → Share (iPhone, Safari) or ⋮ (Android, Chrome) → **Add to Home Screen**.
Connect with the same username, repo, and token.

## How syncing works

- Typing auto-saves after a short pause (or press ⌘S); each save commits the file to `sorta-data`.
- The note list re-syncs when you open the app or switch back to it; ↻ forces a refresh.
- If the same note was changed on another device in the meantime, the save is refused rather than
  overwriting it. Go back, refresh, and re-apply your edit.
- Offline, the app opens with your last-synced notes, but edits need a connection to save.

## Security notes

- The token is stored in the browser on each device. It can only read and write `sorta-data`.
  If a device is lost, revoke the token on GitHub.
- "Disconnect" removes the token and cached notes from that device.
