#!/usr/bin/env bash
# 開発用composeのbotコンテナ内でコマンドを実行する共通ヘルパー。
# ホストに Node.js / pnpm が無くても、lint・test・typecheck 等をコンテナ内で回せる。
#
#   使い方: .claude/scripts/dc.sh pnpm lint
#           .claude/scripts/dc.sh pnpm exec vitest run src/foo.test.ts
#
# botが起動中(docker compose up)なら exec、止まっていれば使い捨てコンテナ(run --rm)で実行する。
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
cd "$root" || {
	echo "dc.sh: project root not found" >&2
	exit 1
}

cid=$(docker compose ps -q bot 2>/dev/null)
if [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" = "true" ]; then
	exec docker compose exec -T bot "$@"
else
	exec docker compose run --rm -T bot "$@"
fi
