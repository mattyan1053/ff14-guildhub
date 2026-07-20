---
name: local-ci
description: GitHub ActionsのCIと同等のチェックを開発用composeコンテナ内で一括実行する。push前・PR作成前の最終確認、またはCIが落ちたときの再現に使う。
---

# local-ci: CI相当のチェックをコンテナ内で実行

`.github/workflows/ci.yaml` と同じチェックを、開発用composeの `bot` コンテナ内で走らせ、結果をまとめて報告する。ホストでpnpmを直接実行しない。実行はリポジトリ直下の `.claude/scripts/dc.sh` 経由で行う(botが起動中なら`exec`、停止中なら使い捨てコンテナで実行される)。

## 実行するチェック

CIと同様に**途中で失敗しても止めず、全チェックを最後まで実行する**(fail-fast: false 相当)。ただし1つでも失敗したら全体を失敗として扱う。コンテナ起動を1回に抑えるため、まとめて実行する:

```bash
./.claude/scripts/dc.sh sh -c '
  fail=0
  pnpm install --frozen-lockfile || fail=1   # package.json/lockの変更を反映(CIと同じ前提に揃える)
  pnpm lint                        || fail=1
  pnpm typecheck                   || fail=1
  pnpm build                       || fail=1
  pnpm knip                        || fail=1
  pnpm depcruise                   || fail=1
  pnpm test:coverage               || fail=1
  pnpm audit --prod --audit-level=high || fail=1
  exit "$fail"
'
```

- `dc.sh` はdevイメージと `/app/node_modules` ボリュームを再利用するため、`package.json`/`pnpm-lock.yaml` を変更したときは先頭の `pnpm install --frozen-lockfile` が無いとCIと違う(古い依存の)結果になる。必ず含める。
- 各チェックを `|| fail=1` で拾い、最後に `exit "$fail"` で集約する。`;` 連結だと最後のコマンドの終了コードしか返らず、途中の失敗を見逃すので使わない。
- 個別に成否を切り分けたいときは、各チェックを `./.claude/scripts/dc.sh pnpm lint` のように単体で実行してよい。

### PR向け: Dockerイメージのビルド確認

PRでは `ci.yaml` の `docker-build` ジョブが本番 `runtime` ステージのビルド(push無し)を検証する。**Dockerfileや依存を変更したPRを出す前**は、これも確認する:

```bash
docker build --target runtime .
```

Dockerfileにも依存にも触れていない変更では省略してよい。

## 進め方

1. 上記を実行し、集約された終了コードで全体の成否を判断する(個別チェックの結果も拾って報告する)。
2. 結果を ✅/❌ の一覧で報告する。すべて✅なら「push可能」と明言する。1つでも❌なら push すべきでない旨を伝える。
3. 失敗があった場合:
   - フォーマット・lint・型エラー・未使用exportなど修正方針が自明なものは、その場で修正して失敗したチェックを再実行する。
   - 設計判断が絡むもの(depcruiseの境界違反、auditの脆弱性対応など)は、修正案を提示してユーザーに確認する。
4. docs/Markdown・`.claude/` のみの変更ではCI自体がスキップされるため、その場合はチェック不要である旨を伝えて終了してよい。

## 前提

- Docker / docker compose が利用できること。Node.js・pnpm はホストに無くてよい(すべてコンテナ内で動く)。
- コンテナイメージが未ビルドの初回は、`dc.sh` 経由の実行時にビルドが走る。
