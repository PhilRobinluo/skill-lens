#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Skill Lens — One-click installer
# Usage: curl -fsSL https://raw.githubusercontent.com/arthurai-cai/skill-manager/main/install.sh | bash
# ---------------------------------------------------------------------------

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

INSTALL_DIR="${HOME}/.claude/skill-lens"
REPO_URL="https://github.com/arthurai-cai/skill-lens.git"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()  { echo -e "${BLUE}[info]${NC}  $1"; }
ok()    { echo -e "${GREEN}[✓]${NC}     $1"; }
warn()  { echo -e "${YELLOW}[!]${NC}     $1"; }
fail()  { echo -e "${RED}[✗]${NC}     $1"; exit 1; }

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

echo ""
echo -e "${CYAN}${BOLD}"
echo "  ┌─────────────────────────────────────┐"
echo "  │    技能透镜 Skill Lens Installer     │"
echo "  │    Claude Code Skills Dashboard      │"
echo "  └─────────────────────────────────────┘"
echo -e "${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Check prerequisites
# ---------------------------------------------------------------------------

info "Checking prerequisites..."

# Check git
if ! command -v git &>/dev/null; then
  fail "git is not installed. Please install git first."
fi
ok "git found"

# Check Node.js (18+)
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install it via: brew install node (macOS) or https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js 18+ required, found v$(node -v). Please upgrade."
fi
ok "Node.js $(node -v)"

# Check pnpm
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found. Installing via corepack..."
  corepack enable && corepack prepare pnpm@latest --activate 2>/dev/null \
    || npm install -g pnpm
  if ! command -v pnpm &>/dev/null; then
    fail "Failed to install pnpm. Please install manually: npm install -g pnpm"
  fi
fi
ok "pnpm $(pnpm -v)"

# Check if ~/.claude/ exists (i.e., user has Claude Code)
if [ ! -d "${HOME}/.claude" ]; then
  warn "~/.claude/ not found. You can still run in demo mode (DEMO=1)."
fi

echo ""

# ---------------------------------------------------------------------------
# Step 2: Clone / Update repository
# ---------------------------------------------------------------------------

if [ -d "$INSTALL_DIR" ]; then
  info "Existing installation found. Updating..."
  cd "$INSTALL_DIR"
  git pull --rebase --quiet
  ok "Updated to latest version"
else
  info "Cloning Skill Lens..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  ok "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ---------------------------------------------------------------------------
# Step 3: Install dependencies
# ---------------------------------------------------------------------------

info "Installing dependencies..."
pnpm install --frozen-lockfile --quiet 2>/dev/null || pnpm install --quiet
ok "Dependencies installed"

# ---------------------------------------------------------------------------
# Step 4: Create data directory
# ---------------------------------------------------------------------------

mkdir -p data
ok "Data directory ready"

# ---------------------------------------------------------------------------
# Step 5: Create macOS launcher (optional)
# ---------------------------------------------------------------------------

if [[ "$(uname)" == "Darwin" ]]; then
  echo ""
  info "Creating macOS Dock launcher..."

  APP_DIR="${HOME}/Applications/Skill Lens.app/Contents/MacOS"
  mkdir -p "$APP_DIR"

  cat > "${APP_DIR}/launch.sh" <<'LAUNCH'
#!/bin/bash
INSTALL_DIR="${HOME}/.claude/skill-manager"
cd "$INSTALL_DIR" || exit 1

# Kill existing dev server if running
lsof -ti:3000 | xargs kill 2>/dev/null || true

# Start dev server in background
pnpm dev &
DEV_PID=$!

# Wait for server to be ready
for i in $(seq 1 30); do
  if curl -s http://localhost:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Open browser
open "http://localhost:3000"

# Keep running
wait $DEV_PID
LAUNCH
  chmod +x "${APP_DIR}/launch.sh"

  # Create Info.plist
  cat > "${HOME}/Applications/Skill Lens.app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>launch.sh</string>
  <key>CFBundleName</key>
  <string>Skill Lens</string>
  <key>CFBundleIdentifier</key>
  <string>com.skill-lens.app</string>
</dict>
</plist>
PLIST

  ok "Dock launcher created at ~/Applications/Skill Lens.app"
fi

# ---------------------------------------------------------------------------
# Done!
# ---------------------------------------------------------------------------

echo ""
echo -e "${GREEN}${BOLD}  ✅ Installation complete!${NC}"
echo ""
echo -e "  ${BOLD}Start the dashboard:${NC}"
echo -e "    cd ${INSTALL_DIR}"
echo -e "    pnpm dev"
echo ""
echo -e "  ${BOLD}Or use the Dock launcher${NC} (macOS)"
echo ""
echo -e "  ${BOLD}Demo mode${NC} (no Claude Code skills needed):"
echo -e "    DEMO=1 pnpm dev"
echo ""
echo -e "  ${BOLD}Custom skill paths:${NC}"
echo -e "    SKILL_DIRS=/path/to/skills pnpm dev"
echo ""
echo -e "  Dashboard will open at ${CYAN}http://localhost:3000${NC}"
echo ""
