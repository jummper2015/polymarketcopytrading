#!/usr/bin/env bash
# ─── MESIRVE CopyBot — Cron Setup Script ────────────────────────
#
# Auto-detects environment paths and installs the crontab with
# proper PATH, lockfile guards, and log rotation.
#
# Usage:
#   bash scripts/setup-cron.sh           # Install crontab
#   bash scripts/setup-cron.sh --check   # Show what would be installed
#   bash scripts/setup-cron.sh --remove  # Remove all cron jobs
#
# Requirements:
#   - Node.js >=20
#   - npm dependencies installed
#   - .env.local configured

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRONTAB_FILE="$SCRIPT_DIR/crontab.txt"
LOGS_DIR="$PROJECT_DIR/logs"

# ─── Colors ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Action ─────────────────────────────────────────────────────
ACTION="${1:-install}"

case "$ACTION" in
  --remove|remove|-r)
    echo -e "${YELLOW}Removing all cron jobs...${NC}"
    crontab -r 2>/dev/null && echo -e "${GREEN}✅ Crontab removed.${NC}" || echo -e "${YELLOW}⚠️  No crontab to remove.${NC}"
    exit 0
    ;;
  --check|check|-c)
    echo -e "${BLUE}${BOLD}=== Crontab file template (not installed) ===${NC}\n"
    cat "$CRONTAB_FILE"
    echo ""
    echo -e "${YELLOW}Run without --check to install with auto-detected paths.${NC}"
    exit 0
    ;;
  install|--install|-i|"")
    ;;
  *)
    echo -e "${RED}Unknown action: $ACTION${NC}"
    echo "Usage: bash scripts/setup-cron.sh [--check|--remove]"
    exit 1
    ;;
esac

# ─── Pre-flight Checks ─────────────────────────────────────────

echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║        MESIRVE CopyBot — Cron Setup                 ║${NC}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check 1: Node.js
echo -n "  Checking Node.js >=20... "
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -ge 20 ]; then
    echo -e "${GREEN}✅ $(node -v)${NC}"
  else
    echo -e "${RED}❌ Found $(node -v) — need >=20${NC}"
    exit 1
  fi
else
  echo -e "${RED}❌ Node.js not found${NC}"
  exit 1
fi

# Check 2: npm + Detect npm path
echo -n "  Checking npm... "
if command -v npm &>/dev/null; then
  NPM_PATH=$(command -v npm)
  NPM_DIR=$(dirname "$NPM_PATH")
  echo -e "${GREEN}✅ $NPM_PATH${NC}"
else
  echo -e "${RED}❌ npm not found${NC}"
  exit 1
fi

# Check 3: flock (for lockfile guard)
echo -n "  Checking flock... "
if command -v flock &>/dev/null; then
  echo -e "${GREEN}✅ $(command -v flock)${NC}"
else
  echo -e "${YELLOW}⚠️  not found — overlapping runs won't be prevented${NC}"
  echo "     Install: apt-get install util-linux"
fi

# Check 4: Project dependencies
echo -n "  Checking node_modules... "
if [ -f "$PROJECT_DIR/node_modules/.bin/tsx" ]; then
  echo -e "${GREEN}✅ installed${NC}"
else
  echo -e "${RED}❌ Run 'npm install' first${NC}"
  exit 1
fi

# Check 5: .env.local
echo -n "  Checking .env.local... "
if [ -f "$PROJECT_DIR/.env.local" ]; then
  if grep -q "SIMULATION_MODE.*paper_only" "$PROJECT_DIR/.env.local"; then
    echo -e "${GREEN}✅ configured${NC}"
  else
    echo -e "${YELLOW}⚠️  SIMULATION_MODE=paper_only not set${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  missing — using defaults${NC}"
fi

# Check 6: Database
echo -n "  Checking database... "
if [ -f "$PROJECT_DIR/data/mesirve.db" ] || [ -f "$PROJECT_DIR/data/hermes.db" ]; then
  echo -e "${GREEN}✅ found${NC}"
else
  echo -e "${YELLOW}⚠️  not found — run 'npm run seed' first${NC}"
fi

# Check 7: crontab file
echo -n "  Checking crontab file... "
if [ -f "$CRONTAB_FILE" ]; then
  echo -e "${GREEN}✅ $CRONTAB_FILE${NC}"
else
  echo -e "${RED}❌ crontab.txt not found${NC}"
  exit 1
fi

echo ""

# ─── Detect Node bin paths ──────────────────────────────────────
# We need to find all directories that might contain node/npm executables
# so cron's minimal PATH can find them.
NODE_BIN_DIR=$(dirname "$(command -v node)")
DETECTED_PATH="${NPM_DIR}:${NODE_BIN_DIR}:/usr/local/bin:/usr/bin:/bin"

# Remove duplicates from PATH
DETECTED_PATH=$(echo "$DETECTED_PATH" | tr ':' '\n' | awk '!seen[$0]++' | tr '\n' ':' | sed 's/:$//')

echo -e "  ${BLUE}Detected PATH for cron:${NC}"
echo -e "  ${DETECTED_PATH}"
echo ""

# ─── Logs Directory ────────────────────────────────────────────
mkdir -p "$LOGS_DIR"
echo -e "  Logs directory: ${GREEN}$LOGS_DIR${NC}"
echo ""

# ─── Build crontab from template ────────────────────────────────
TEMP_CRONTAB=$(mktemp)

# Read the template and make substitutions:
# 1. PROJECT_DIR → actual project directory
# 2. PATH line → detected PATH with npm/node included
# 3. Keep SHELL line as-is

while IFS= read -r line; do
  # Replace PROJECT_DIR placeholder with actual path
  line="${line//PROJECT_DIR/$PROJECT_DIR}"

  # Replace the PATH line with the detected one
  if [[ "$line" =~ ^PATH= ]]; then
    echo "PATH=$DETECTED_PATH"
    continue
  fi

  # Skip the old SHELL line (we handle it below)
  if [[ "$line" =~ ^SHELL= ]]; then
    continue
  fi

  echo "$line"
done < "$CRONTAB_FILE" > "$TEMP_CRONTAB"

# Prepend SHELL at the top (cron needs it)
sed -i "1i SHELL=/bin/bash" "$TEMP_CRONTAB"

# ─── Install ────────────────────────────────────────────────────

echo -e "${BOLD}Installing crontab...${NC}"
echo ""

if crontab "$TEMP_CRONTAB" 2>&1; then
  echo -e "${GREEN}${BOLD}✅ Crontab installed successfully!${NC}"
  echo ""
  echo -e "${BLUE}Active cron jobs:${NC}"
  crontab -l | grep -v '^#' | grep -v '^$' | grep -v '^PATH=' | grep -v '^SHELL=' || echo "  (none)"
  echo ""
  echo -e "${BOLD}Pipeline schedule:${NC}"
  echo "  🔄 Every 15 min : monitor → score → paper:create → update-pnl → review"
  echo "  📡 Daily 00:00  : scan:leaderboard"
  echo "  🧬 Daily 00:30  : scan:wallets"
  echo "  🧠 Daily 01:00  : update:rules"
  echo "  📊 Daily 08:00  : report:daily"
  echo "  🗑️  Monthly 1st  : log rotation"
  echo ""
  echo -e "${YELLOW}Logs:${NC}  $LOGS_DIR/pipeline.log  |  $LOGS_DIR/daily.log"
  echo -e "${YELLOW}Stop:${NC}  bash scripts/setup-cron.sh --remove"
  echo ""
else
  echo -e "${RED}❌ Failed to install crontab.${NC}"
  echo "   You can install the generated crontab manually: crontab $TEMP_CRONTAB"
  exit 1
fi

# Cleanup
rm -f "$TEMP_CRONTAB"
