---
name: local-ci
description: GitHub ActionsのCIと同等のチェックを開発用composeコンテナ内で一括実行する。push前・PR作成前の最終確認、またはCIが落ちたときの再現に使う。
---

# local-ci: CI相当のチェックをコンテナ内で実行

`.github/workflows/ci.yaml` と同じチェックを、開発用composeの `bot` コンテナ内で走らせ、結果をまとめて報告する。ホストでpnpmを直接実行しない。実行はリポジトリ直下の `.claude/scripts/dc.sh` 経由で行う(botが起動中なら`exec`、停止中なら使い捨てコンテナで実行される)。

## 実行するチェック

CIと同様に**途中で失敗しても止めず、全チェックを最後まで実行する**(fail-fast: false 相当)。コンテナ起動を1回に抑えるため、まとめて実行する:

```bash
./.claude/scripts/dc.sh sh -c '
  pnpm lint;
  pnpm typecheck;
  pnpm build;
  pnpm knip;
  pnpm depcruise;
  pnpm test:coverage;
  pnpm audit --prod --audit-level=high
'
```

個別に成否を切り分けたいときは、各チェックを `./.claude/scripts/dc.sh pnpm lint` のように単体で実行してよい。

## 進め方

1. 上記を実行し、各チェックの成否を記録する(最後まで走らせる)。
2. 結果を ✅/❌ の一覧で報告する。すべて✅なら「push可能」と明言する。
3. 失敗があった場合:
   - フォーマット・lint・型エラー・未使用exportなど修正方針が自明なものは、その場で修正して失敗したチェックを再実行する。
   - 設計判断が絡むもの(depcruiseの境界違反、auditの脆弱性対応など)は、修正案を提示してユーザーに確認する。
4. docs/Markdownのみの変更ではCI自体がスキップされるため、その場合はチェック不要である旨を伝えて終了してよい。

## 前提

- Docker / docker compose が利用できること。Node.js・pnpm はホストに無くてよい(すべてコンテナ内で動く)。
- コンテナイメージが未ビルドの初回は、`dc.sh` 経由の実行時にビルドが走る。
