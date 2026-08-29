#!/usr/bin/env bash
# 本番ビルドをローカルで確認する。
#   使い方: scripts/preview.sh [ポート]
# next dev が同じ .next を掴んでいるとチャンク不整合で画面が壊れるため、
# 起動中のサーバーを確実に止め、ポート解放を待ってからクリーンビルドする。
set -euo pipefail

PORT="${1:-3459}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

stop_port() {
  local port=$1
  local pids
  # WSLでは lsof -ti がPIDを返さないことがあるため ss から取る
  pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
  local waited=0
  until ! ss -tln 2>/dev/null | grep -q ":$port "; do
    sleep 1
    waited=$((waited + 1))
    if [ $waited -ge 15 ]; then
      echo "ポート $port を解放できませんでした" >&2
      exit 1
    fi
  done
}

echo "==> 3000 / $PORT のサーバーを停止"
stop_port 3000
stop_port "$PORT"

echo "==> クリーンビルド"
rm -rf "$ROOT/apps/web/.next"
pnpm --filter web exec next build

echo "==> ポート $PORT で起動"
cd "$ROOT/apps/web"
nohup npx next start -p "$PORT" > /tmp/regen-preview-$PORT.log 2>&1 &

for _ in $(seq 1 40); do
  if curl -sf "http://localhost:$PORT/" > /dev/null; then
    echo "READY: http://localhost:$PORT/"
    exit 0
  fi
  sleep 1
done

echo "起動できませんでした。/tmp/regen-preview-$PORT.log を確認してください" >&2
exit 1
