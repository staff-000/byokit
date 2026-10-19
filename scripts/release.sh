#!/usr/bin/env bash
# ==============================================================================
# byokit Release Script (Bash / Zsh)
# ==============================================================================
# This script automates and documents the complete release process for byokit:
#   1. Pre-flight verification (clean workspace, git pull, test suites, types, site build)
#   2. Version bumping across package.json, packages/byokit, and packages/python
#   3. Multi-package publishing (npm, PyPI) or triggering GitHub Actions workflow
#   4. Git commit, tag, push, and GitHub release creation
#   5. Post-release registry verification
#
# ------------------------------------------------------------------------------
# Usage:
#   ./scripts/release.sh [patch|minor|major|<version>] [options]
#
# Examples:
#   ./scripts/release.sh patch --dry-run     # Simulate release without publishing
#   ./scripts/release.sh patch --trigger     # Recommended: trigger GitHub Actions release workflow
#   ./scripts/release.sh patch --local       # Local release: publish directly to npm & PyPI and push git tag
#   ./scripts/release.sh minor               # Interactive: prompts for mode and confirmation
#
# Options:
#   --dry-run    Simulate release (test build without pushing tags or publishing)
#   --trigger    Trigger GitHub Actions workflow (requires `gh` CLI or GH_TOKEN)
#   --local      Publish directly from this machine (requires NPM_TOKEN & PYPI_API_TOKEN)
#   --skip-tests Skip the pre-flight test suites (useful for emergency hotfixes)
#   --help, -h   Show this help message
# ------------------------------------------------------------------------------

set -euo pipefail

# ANSI color codes for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Resolve project root directory (directory containing package.json)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ------------------------------------------------------------------------------
# 1. Parse Arguments
# ------------------------------------------------------------------------------
TARGET=""
MODE="interactive"
SKIP_TESTS=false
ALLOW_DIRTY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    patch|minor|major|[0-9]*.[0-9]*.[0-9]*)
      TARGET="$1"
      shift
      ;;
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    --trigger)
      MODE="trigger"
      shift
      ;;
    --local)
      MODE="local"
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=true
      shift
      ;;
    --help|-h)
      sed -n '2,27p' "$0" | sed 's/^# //' | sed 's/^#//'
      exit 0
      ;;
    *)
      echo -e "${RED}Error: Unknown argument '$1'${NC}"
      echo "Run './scripts/release.sh --help' for usage."
      exit 1
      ;;
  esac
done

# Default target is "patch" if not specified
if [[ -z "$TARGET" ]]; then
  TARGET="patch"
fi

echo -e "${BLUE}======================================================${NC}"
echo -e "${BOLD}${CYAN}🚀 byokit Release Automation${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "Target bump:   ${YELLOW}${TARGET}${NC}"
echo -e "Release mode:  ${YELLOW}${MODE}${NC}"
echo -e "Project root:  ${ROOT_DIR}"
echo ""

# ------------------------------------------------------------------------------
# 2. Pre-flight Checks: Git Workspace
# ------------------------------------------------------------------------------
echo -e "${CYAN}▶ Step 1: Checking git repository status...${NC}"

# Check for uncommitted changes
if [[ "$ALLOW_DIRTY" == false && -n "$(git status --porcelain)" ]]; then
  echo -e "${RED}❌ Error: You have uncommitted or untracked changes.${NC}"
  echo "Please commit or stash your changes before releasing (or pass --allow-dirty)."
  git status -s
  exit 1
fi
if [[ "$ALLOW_DIRTY" == true ]]; then
  echo -e "  ${YELLOW}⚠️  Allowing dirty working tree (--allow-dirty).${NC}"
else
  echo -e "  ${GREEN}✓${NC} Working tree is clean."
fi

# Check current branch
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo -e "${YELLOW}⚠️  Warning: You are currently on branch '$CURRENT_BRANCH', not 'main'.${NC}"
  read -r -p "Continue release on '$CURRENT_BRANCH'? (y/N): " CONFIRM_BRANCH
  if [[ ! "$CONFIRM_BRANCH" =~ ^[Yy]$ ]]; then
    echo "Release aborted."
    exit 1
  fi
else
  echo -e "  ${GREEN}✓${NC} On main branch."
fi

# Fetch remote and check if up to date
echo -e "  Checking origin/main..."
git fetch origin main --quiet || true
UPSTREAM_DIFF="$(git rev-list HEAD..origin/main --count 2>/dev/null || echo 0)"
if [[ "$UPSTREAM_DIFF" -gt 0 ]]; then
  echo -e "${RED}❌ Error: Your branch is behind origin/main by $UPSTREAM_DIFF commit(s).${NC}"
  echo "Please run 'git pull --rebase origin main' first."
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Branch is up to date with origin/main."

# ------------------------------------------------------------------------------
# 3. Pre-flight Checks: Test Suites & Builds
# ------------------------------------------------------------------------------
if [[ "$SKIP_TESTS" == false ]]; then
  echo ""
  echo -e "${CYAN}▶ Step 2: Running pre-flight validation suite...${NC}"

  echo -e "  [1/5] Running JavaScript tests (npm test)..."
  npm test

  echo -e "  [2/5] Running Python tests (npm run test:python)..."
  npm run test:python

  echo -e "  [3/5] Checking TypeScript types (npm run typecheck)..."
  npm run typecheck

  echo -e "  [4/5] Checking Python types (npm run typecheck:python)..."
  npm run typecheck:python

  echo -e "  [5/5] Building static website (npm run site:build)..."
  npm run site:build

  echo -e "  ${GREEN}✓${NC} All pre-flight tests and type checks passed!"
else
  echo -e "${YELLOW}⚠️  Pre-flight tests skipped via --skip-tests.${NC}"
fi

# ------------------------------------------------------------------------------
# 4. Select Release Mode (if interactive)
# ------------------------------------------------------------------------------
if [[ "$MODE" == "interactive" ]]; then
  echo ""
  echo -e "${CYAN}▶ Step 3: Choose release execution method:${NC}"
  echo "  1) Dry Run     - Test build and simulate release without publishing (Safe)"
  echo "  2) GitHub CI   - Trigger GitHub Actions release workflow (Recommended, uses GitHub secrets)"
  echo "  3) Local Live  - Publish directly from this machine to npm & PyPI, push tags"
  echo "  4) Cancel"
  read -r -p "Enter choice [1-4]: " CHOICE

  case "$CHOICE" in
    1) MODE="dry-run" ;;
    2) MODE="trigger" ;;
    3) MODE="local" ;;
    *) echo "Release cancelled."; exit 0 ;;
  esac
fi

# ------------------------------------------------------------------------------
# 5. Execute Release
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}▶ Step 4: Executing release (${MODE})...${NC}"

case "$MODE" in
  dry-run)
    echo -e "${YELLOW}Running simulated release (--dry-run)...${NC}"
    EXTRA_FLAGS=""
    if [[ "$ALLOW_DIRTY" == true ]]; then EXTRA_FLAGS="--allow-dirty"; fi
    node scripts/release.mjs "$TARGET" --dry-run $EXTRA_FLAGS
    echo ""
    echo -e "${GREEN}✓ Dry run completed successfully!${NC}"
    echo "To perform the actual release, run:"
    echo "  ./scripts/release.sh $TARGET --trigger    # via GitHub Actions"
    echo "  ./scripts/release.sh $TARGET --local      # via local credentials"
    ;;

  trigger)
    echo -e "${YELLOW}Dispatching GitHub Actions release workflow...${NC}"
    node scripts/trigger-release.mjs "$TARGET"
    echo ""
    echo -e "${GREEN}✓ Release workflow triggered!${NC}"
    echo "Track live progress at:"
    echo "  👉 https://github.com/staff-000/byokit/actions/workflows/release.yml"
    ;;

  local)
    echo -e "${YELLOW}Confirming local live release:${NC}"
    echo "This will bump version ($TARGET), publish to npm and PyPI, create a git tag, and push to GitHub."
    read -r -p "Are you sure you want to proceed? (y/N): " CONFIRM_LIVE
    if [[ ! "$CONFIRM_LIVE" =~ ^[Yy]$ ]]; then
      echo "Release aborted."
      exit 0
    fi

    EXTRA_FLAGS=""
    if [[ "$ALLOW_DIRTY" == true ]]; then EXTRA_FLAGS="--allow-dirty"; fi
    node scripts/release.mjs "$TARGET" --push $EXTRA_FLAGS
    echo ""
    echo -e "${GREEN}✓ Local release and publish completed!${NC}"

    # Verify published artifacts
    echo ""
    echo -e "${CYAN}▶ Step 5: Verifying registry availability...${NC}"
    echo "Waiting 5 seconds for registry indexes to update..."
    sleep 5
    node scripts/test-released-packages.mjs || {
      echo -e "${YELLOW}Note: Registries may take 1-2 minutes to reflect the new version.${NC}"
      echo "Run 'npm run test:released' in a moment to verify."
    }
    ;;
esac

echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${BOLD}${GREEN}🎉 Release process finished!${NC}"
echo -e "${GREEN}======================================================${NC}"
