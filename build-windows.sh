#!/usr/bin/env bash
# ================================================================
#  Clinic Inventory -- Windows Desktop App Builder
#  Run this in Git Bash on Windows (or WSL)
#  Requirements: Node.js LTS  (https://nodejs.org/)
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/windows-build"
APP_DIR="$SCRIPT_DIR/artifacts/store-control"

# ── colours (fall back gracefully if terminal doesn't support them) ──
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m';  RED='\033[0;31m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; CYAN=''; RED=''; NC=''
fi

die() { echo -e "${RED}ERROR: $*${NC}"; echo; read -rp "Press Enter to close..." || true; exit 1; }

echo -e "${CYAN}"
echo "  =================================================="
echo "    AUC Clinic Inventory  |  Windows Installer Builder"
echo "  =================================================="
echo -e "${NC}"

# ── 1. Check Node.js ──────────────────────────────────────────────
echo -e "${YELLOW}[1/4] Checking Node.js...${NC}"
if ! command -v node &>/dev/null; then
  die "Node.js is not installed.\n\n  Download and install Node.js LTS from:\n    https://nodejs.org/\n\n  Then run this script again."
fi
NODE_VER="$(node --version)"
echo -e "      Node.js ${NODE_VER} found."
echo

if ! command -v npm &>/dev/null; then
  die "npm is not installed (it normally ships with Node.js).\n  Re-install Node.js from https://nodejs.org/"
fi

# ── 2. Build the React app for Electron ──────────────────────────
echo -e "${YELLOW}[2/4] Building React app for Electron...${NC}"

if [ -f "$APP_DIR/dist/public/index.html" ]; then
  echo "      Pre-built app files found — skipping rebuild."
  echo "      (Delete ${APP_DIR}/dist/public/ to force rebuild)"
else
  echo "      Building Vite app with Electron config..."
  cd "$APP_DIR"

  # Try pnpm first, fall back to npm
  if command -v pnpm &>/dev/null; then
    pnpm install --no-frozen-lockfile 2>/dev/null || true
    pnpm run build:electron
  else
    npm install
    npx vite build --config vite.electron.config.ts
  fi

  echo -e "      ${GREEN}Build complete.${NC}"
fi
echo

# ── 3. Copy built files into windows-build ────────────────────────
echo -e "${YELLOW}[3/4] Preparing installer package...${NC}"
mkdir -p "$BUILD_DIR/dist/public"

if [ -d "$APP_DIR/dist/public" ] && [ -f "$APP_DIR/dist/public/index.html" ]; then
  cp -r "$APP_DIR/dist/public/." "$BUILD_DIR/dist/public/"
  echo "      App files copied to windows-build/dist/public/"
else
  die "Built app files not found at $APP_DIR/dist/public/\nRun the build step first."
fi

cd "$BUILD_DIR"
echo "      Installing Electron build tools (first run ~120 MB)..."
npm install
echo -e "      ${GREEN}Tools ready.${NC}"

echo "      Running electron-builder..."
npx electron-builder --win --config electron-builder.json
echo -e "      ${GREEN}Packaging complete.${NC}"
echo

# ── Done ──────────────────────────────────────────────────────────
OUTPUT_DIR="$BUILD_DIR/dist/electron"
echo -e "${CYAN}"
echo "  =================================================="
echo -e "  ${GREEN}BUILD COMPLETE!${CYAN}  Your installer is ready:"
echo
if ls "$OUTPUT_DIR"/*.exe &>/dev/null 2>&1; then
  ls "$OUTPUT_DIR"/*.exe | while read -r f; do
    echo "    → $(basename "$f")"
  done
else
  echo "    → $OUTPUT_DIR"
fi
echo
echo "  Run the Setup .exe to install on any Windows PC."
echo "  The app will appear in:"
echo "    - Start Menu  (under AUC Clinic)"
echo "    - Desktop shortcut"
echo "    - Settings > Apps > Installed apps"
echo -e "  =================================================="
echo -e "${NC}"

# Open output folder in Explorer (works in Git Bash on Windows)
if command -v explorer.exe &>/dev/null 2>&1; then
  explorer.exe "$(cygpath -w "$OUTPUT_DIR")" 2>/dev/null || true
fi

read -rp "Press Enter to close..." || true
