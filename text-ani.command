#!/bin/bash
# Double-click this file in Finder to launch text-ani.
# It starts the local server (needed for ProRes encoding) and opens the app
# in your browser. Keep the Terminal window open while you work; closing it
# stops the app.

cd "$(dirname "$0")" || exit 1

# Finder-launched scripts don't inherit your shell PATH, so add Homebrew's.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

PORT=4444
URL="http://localhost:$PORT"

# Already running? Just open the browser and quit.
if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  echo "text-ani is already running — opening $URL"
  open "$URL"
  exit 0
fi

# Sanity checks.
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found. Install Node.js, then try again."
  echo "Press Return to close."; read -r; exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found. Install it with:  brew install ffmpeg"
  echo "Press Return to close."; read -r; exit 1
fi

# First-run dependency install.
if [ ! -d node_modules ]; then
  echo "First run: installing dependencies…"
  npm install || { echo "npm install failed."; echo "Press Return to close."; read -r; exit 1; }
fi

echo "Starting text-ani…  (keep this window open; close it to stop the app)"
node server.js &
SERVER_PID=$!

# Stop the server when this window/script closes.
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT

# Wait until the server answers, then open the browser.
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "$URL"; then break; fi
  sleep 0.2
done
open "$URL"

wait "$SERVER_PID"
