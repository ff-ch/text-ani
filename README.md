# text-ani

Animate text in the browser and export to **ProRes 4444 with alpha** (transparent .mov).

## Install (macOS)

**Easiest — one line.** Paste this into Terminal and press Return:

```bash
curl -fsSL https://raw.githubusercontent.com/ff-ch/text-ani/main/install.sh | bash
```

It installs Homebrew (if needed), ffmpeg, and Node.js, downloads text-ani to `~/text-ani`, and launches it — with **no “unidentified developer” prompt**, because you run a script you can read rather than opening a downloaded app. ([Read it first](install.sh) if you like.)

Prefer a page with a copy button? Open **[`install.html`](install.html)** in your browser.

## Running it again

Once installed, **double-click `text-ani.command`** in the `~/text-ani` folder.

That's it. The launcher:
- starts the local server (needed for ProRes encoding),
- opens the app in your default browser at http://localhost:4444,
- and stays in a Terminal window. **Keep that window open while you work — closing it stops the app.**

If you double-click it again while it's already running, it just re-opens the browser tab.

> First launch only: it runs `npm install` once to set up. After that, startup is instant.

### Tip
You can rename `text-ani.command` to anything you like, or drag it into your Dock for one-click access. (If you ever download a copy instead of using the installer and macOS blocks it with a security prompt, right-click it → **Open** once — the one-line installer above avoids that.)

## Why a server is needed

ProRes 4444 can only be written by **ffmpeg**, a local program — browsers can't produce that format. The browser designs and renders the frames (with transparency); the tiny local server runs ffmpeg to encode them into the final .mov. The launcher just removes the manual start step.

## Requirements

- **Node.js** and **ffmpeg** (both found automatically from Homebrew at `/opt/homebrew/bin`).
- The **one-line install** above sets both up for you. To install them yourself: `brew install node ffmpeg`

## Manual start (alternative)

```bash
npm start
# then open http://localhost:4444
```

## License

[MIT](LICENSE) © ff-ch
