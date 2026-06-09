# text-ani

Animate text in the browser and export to **ProRes 4444 with alpha** (transparent .mov).

## Running it

**Double-click `text-ani.command`** in Finder.

That's it. The launcher:
- starts the local server (needed for ProRes encoding),
- opens the app in your default browser at http://localhost:4444,
- and stays in a Terminal window. **Keep that window open while you work — closing it stops the app.**

If you double-click it again while it's already running, it just re-opens the browser tab.

> First launch only: it runs `npm install` once to set up. After that, startup is instant.

### Tip
You can rename `text-ani.command` to anything you like, or drag it into your Dock for one-click access. If macOS ever blocks it with a security prompt, right-click it → **Open** once.

## Why a server is needed

ProRes 4444 can only be written by **ffmpeg**, a local program — browsers can't produce that format. The browser designs and renders the frames (with transparency); the tiny local server runs ffmpeg to encode them into the final .mov. The launcher just removes the manual start step.

## Requirements

- **Node.js** and **ffmpeg** installed (both found automatically from Homebrew at `/opt/homebrew/bin`).
  - Install ffmpeg if needed: `brew install ffmpeg`

## Manual start (alternative)

```bash
npm start
# then open http://localhost:4444
```
