#!/usr/bin/env bash
# Blocks a commit if it looks like it contains a secret or an env/data file
# that shouldn't be tracked. Run via .git/hooks/pre-commit (see setup-hooks.sh).
set -euo pipefail

staged_files=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$staged_files" ]; then
  exit 0
fi

violations=0

# Block committing files that should only exist locally.
for pattern in '^\.env\.local$' '^\.env\.[^.]*\.local$' '^config\.json$' '^bot_queue\.json$' '^meetings-log\.json$'; do
  matches=$(echo "$staged_files" | grep -E "$pattern" || true)
  if [ -n "$matches" ]; then
    echo "error: staged file(s) should not be committed:"
    echo "$matches" | sed 's/^/  /'
    violations=1
  fi
done

# Scan staged content for common secret patterns.
secret_pattern='sk-[A-Za-z0-9]{16,}|BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY|AWS_SECRET_ACCESS_KEY[[:space:]]*=|SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[^[:space:]]|(api[_-]?key|token|secret)[[:space:]]*=[[:space:]]*[^[:space:]]'

for file in $staged_files; do
  [ -f "$file" ] || continue
  matches=$(git diff --cached -- "$file" | grep -E '^\+' | grep -viE '\.example$' | grep -EinI "$secret_pattern" || true)
  if [ -n "$matches" ]; then
    echo "error: possible secret in $file:"
    echo "$matches" | sed 's/^/  /'
    violations=1
  fi
done

if [ "$violations" -ne 0 ]; then
  echo ""
  echo "Commit blocked. Move secrets to .env.local (untracked) or use an env var."
  echo "If this is a false positive, adjust scripts/pre-commit-hook.sh."
  exit 1
fi

exit 0
