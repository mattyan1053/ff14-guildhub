#!/usr/bin/env bash
# PostToolUse (Edit|Write) hook:
# 編集されたファイルに、composeのbotコンテナ内で biome check --write を適用し、
# 自動修正できない診断が残った場合は exit 2 で Claude にフィードバックする。
# ホストのpnpm/biomeには依存しない(実行は .claude/scripts/dc.sh 経由)。
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

# プロジェクト外・生成物は対象外
case "$file" in
"$CLAUDE_PROJECT_DIR"/*) ;;
*) exit 0 ;;
esac
case "$file" in
*/node_modules/* | */dist/* | */coverage/* | */data/*) exit 0 ;;
esac

# Biomeが扱う拡張子のみ
case "$file" in
*.ts | *.tsx | *.js | *.mjs | *.cjs | *.json | *.jsonc) ;;
*) exit 0 ;;
esac

# コンテナ内の作業ディレクトリ(/app)からの相対パス
rel=${file#"$CLAUDE_PROJECT_DIR"/}

if ! output=$("$CLAUDE_PROJECT_DIR"/.claude/scripts/dc.sh pnpm exec biome check --write "$rel" 2>&1); then
	{
		echo "Biome check failed for ${rel}:"
		echo "$output"
	} >&2
	exit 2
fi
exit 0
