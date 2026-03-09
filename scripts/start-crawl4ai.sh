#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${CRAWL4AI_ENV_FILE:-$PROJECT_ROOT/.env.local}"

# Load project env so npm run dev works without manual export.
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

CRAWL4AI_URL="${CRAWL4AI_API_URL:-http://127.0.0.1:11235/crawl}"
CRAWL4AI_PYTHON_BIN="${CRAWL4AI_PYTHON_BIN:-/tmp/crawl4ai-venv/bin/python}"
CRAWL4AI_SERVER_FILE="${CRAWL4AI_SERVER_FILE:-/tmp/crawl4ai/deploy/docker/server.py}"
CRAWL4AI_BASE_DIR="${CRAWL4AI_BASE_DIR:-/tmp/crawl4ai-home}"
CRAWL4AI_PID_FILE="${CRAWL4AI_PID_FILE:-/tmp/crawl4ai-dev.pid}"
CRAWL4AI_LOG_FILE="${CRAWL4AI_LOG_FILE:-/tmp/crawl4ai-dev.log}"

if [[ ! "$CRAWL4AI_URL" =~ ^https?:// ]]; then
  echo "[crawl4ai] CRAWL4AI_API_URL is invalid: $CRAWL4AI_URL" >&2
  exit 1
fi

CRAWL4AI_ORIGIN="$(printf '%s' "$CRAWL4AI_URL" | sed -E 's#(https?://[^/]+).*#\1#')"
CRAWL4AI_HEALTH_URL="${CRAWL4AI_ORIGIN}/health"

is_healthy() {
  curl -fsS --max-time 2 "$CRAWL4AI_HEALTH_URL" >/dev/null 2>&1
}

if is_healthy; then
  echo "[crawl4ai] already healthy at $CRAWL4AI_HEALTH_URL"
  exit 0
fi

if [[ -f "$CRAWL4AI_PID_FILE" ]]; then
  old_pid="$(cat "$CRAWL4AI_PID_FILE" 2>/dev/null || true)"
  if [[ -n "${old_pid}" ]] && kill -0 "$old_pid" 2>/dev/null; then
    echo "[crawl4ai] waiting existing process (pid=$old_pid) ..."
    for _ in {1..12}; do
      if is_healthy; then
        echo "[crawl4ai] healthy at $CRAWL4AI_HEALTH_URL"
        exit 0
      fi
      sleep 1
    done
  fi
  rm -f "$CRAWL4AI_PID_FILE"
fi

if [[ ! -x "$CRAWL4AI_PYTHON_BIN" || ! -f "$CRAWL4AI_SERVER_FILE" ]]; then
  echo "[crawl4ai] missing runtime files." >&2
  echo "  python: $CRAWL4AI_PYTHON_BIN" >&2
  echo "  server: $CRAWL4AI_SERVER_FILE" >&2
  echo "[crawl4ai] set CRAWL4AI_PYTHON_BIN / CRAWL4AI_SERVER_FILE to your local install path." >&2
  exit 1
fi

mkdir -p "$CRAWL4AI_BASE_DIR"
echo "[crawl4ai] starting server ..."
nohup env CRAWL4_AI_BASE_DIRECTORY="$CRAWL4AI_BASE_DIR" \
  "$CRAWL4AI_PYTHON_BIN" "$CRAWL4AI_SERVER_FILE" >"$CRAWL4AI_LOG_FILE" 2>&1 &
new_pid="$!"
echo "$new_pid" >"$CRAWL4AI_PID_FILE"

for _ in {1..40}; do
  if is_healthy; then
    echo "[crawl4ai] started (pid=$new_pid) and healthy at $CRAWL4AI_HEALTH_URL"
    exit 0
  fi
  if ! kill -0 "$new_pid" 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "[crawl4ai] failed to start. recent logs:" >&2
tail -n 80 "$CRAWL4AI_LOG_FILE" >&2 || true
exit 1
