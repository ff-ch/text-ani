#!/usr/bin/env bash
#
# text-ani installer
# ------------------
# Installs Homebrew (if missing), ffmpeg, and Node.js, downloads text-ani,
# installs its dependencies, and launches it in your browser.
#
#   curl -fsSL https://raw.githubusercontent.com/ff-ch/text-ani/main/install.sh | bash
#
# It only uses tools you can see in this file — no app to open, so no macOS
# "unidentified developer" prompt.

set -euo pipefail

REPO="ff-ch/text-ani"
TARBALL="https://github.com/$REPO/archive/refs/heads/main.tar.gz"

# --- pretty output (colours only when writing to a real terminal) -----------
if [ -t 1 ]; then
  B=$'\033[1;36m'; G=$'\033[1;32m'; Y=$'\033[1;33m'; R=$'\033[1;31m'; D=$'\033[2m'; N=$'\033[0m'
else
  B=; G=; Y=; R=; D=; N=
fi
say()  { printf "%s▸%s %s\n" "$B" "$N" "$1"; }
ok()   { printf "%s✓%s %s\n" "$G" "$N" "$1"; }
warn() { printf "%s!%s %s\n" "$Y" "$N" "$1"; }
die()  { printf "%s✗ %s%s\n" "$R" "$1" "$N" >&2; exit 1; }

printf "\n  %stext-ani installer%s\n  %sanimate text → export ProRes 4444 with alpha%s\n\n" "$B" "$N" "$D" "$N"

# --- macOS only -------------------------------------------------------------
if [ "$(uname -s)" != "Darwin" ]; then
  die "This installer is for macOS. On Linux: install node + ffmpeg with your package manager, then 'git clone https://github.com/$REPO && cd text-ani && npm install && npm start'."
fi

# --- where to install -------------------------------------------------------
# Pop a native "choose folder" window so the user decides where it goes (this
# works even when the script is run via `curl | bash`). Falls back to
# ~/Documents/text-ani if there's no desktop session or the user cancels.
PARENT=""
if command -v osascript >/dev/null 2>&1; then
  PARENT="$(osascript -e 'POSIX path of (choose folder with prompt "Choose a folder to install text-ani into:" default location (path to documents folder))' 2>/dev/null)" || PARENT=""
fi
[ -n "$PARENT" ] || PARENT="$HOME/Documents"
APP_DIR="${PARENT%/}/text-ani"
say "Installing into: $APP_DIR"

# --- Homebrew ---------------------------------------------------------------
if ! command -v brew >/dev/null 2>&1; then
  say "Installing Homebrew (it may ask for your Mac password)…"
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || die "Homebrew install failed — install it from https://brew.sh then re-run this."
  # make brew available to the rest of this script
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$b" ] && eval "$("$b" shellenv)"
  done
fi
command -v brew >/dev/null 2>&1 || die "Homebrew isn't on PATH — open a new Terminal window and re-run."
ok "Homebrew ready"

# --- Node.js ----------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  ok "Node.js $(node -v) already installed"
else
  say "Installing Node.js…"
  brew install node >/dev/null
  ok "Node.js $(node -v) installed"
fi

# --- ffmpeg (Homebrew's build includes the prores_ks encoder we need) -------
if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg already installed"
else
  say "Installing ffmpeg…"
  brew install ffmpeg >/dev/null
  ok "ffmpeg installed"
fi

# --- download the app -------------------------------------------------------
say "Downloading text-ani → $APP_DIR"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
curl -fsSL "$TARBALL" | tar xz -C "$APP_DIR" --strip-components=1 || die "Download failed."
ok "Downloaded"

# --- install dependencies ---------------------------------------------------
say "Installing dependencies…"
( cd "$APP_DIR" && npm install --silent ) || die "npm install failed."
ok "Dependencies installed"

# --- launch -----------------------------------------------------------------
ok "All set! Starting text-ani — your browser will open in a moment."
printf "\n  %sStart it again any time:%s double-click %stext-ani.command%s in %s\n  (or run:  cd %s && npm start)\n\n" "$D" "$N" "$B" "$N" "$APP_DIR" "$APP_DIR"
exec bash "$APP_DIR/text-ani.command"
