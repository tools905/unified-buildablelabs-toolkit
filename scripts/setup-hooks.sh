#!/usr/bin/env bash
# One-time setup: installs the pre-commit hook. Run from the repo root:
#   ./scripts/setup-hooks.sh
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
cp "$repo_root/scripts/pre-commit-hook.sh" "$repo_root/.git/hooks/pre-commit"
chmod +x "$repo_root/.git/hooks/pre-commit"

echo "Installed pre-commit hook at .git/hooks/pre-commit"
