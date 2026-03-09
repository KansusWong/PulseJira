#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Best-effort startup: allow app dev even when crawl4ai is not installed locally.
# Set CRAWL4AI_STRICT_START=1 to enforce hard-fail behavior.
if ! "$SCRIPT_DIR/start-crawl4ai.sh"; then
  if [[ "${CRAWL4AI_STRICT_START:-0}" == "1" ]]; then
    echo "[crawl4ai] strict mode enabled, aborting dev startup." >&2
    exit 1
  fi
  echo "[crawl4ai] start failed, continuing with app-only dev mode." >&2
fi

WATCHPACK_POLLING=true next dev --turbo "$@"
