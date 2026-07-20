# 開発ガイド

## セットアップ

必要なもの: Node.js >= 22.9.0

```bash
corepack enable        # pnpmを有効化(バージョンはpackage.jsonで固定)
pnpm install
cp .env.example .env   # DISCORD_TOKENを設定
pnpm dev               # watch実行。discord: ready が出れば接続成功
```

DBはデフォルトで `./data/bot.sqlite3` に作成される(gitignore済み)。

コンテナ内で開発する場合はリポジトリ直下の `compose.yaml` を使う:

```bash
docker compose up
```

## コマンド

```bash
pnpm dev        # tsx watchでBotを起動
pnpm build      # dist/へビルド
pnpm start      # ビルド済みアプリケーションの起動
pnpm test       # Vitest
pnpm lint       # Biome(format + lintチェック)
pnpm format     # Biomeフォーマット適用
pnpm typecheck  # tsc --noEmit
```

コード変更後は `pnpm lint && pnpm typecheck && pnpm test` を通すこと。CIでも同じチェックが走る(docs/Markdownのみの変更ではスキップされる)。

## アーキテクチャ

責務は4層に分離する([ADR 0003](adr/0003-layered-architecture.md))。

- **Discord Interface** — Gatewayイベント、Interactions、コマンド、Components
- **Application** — Use Case、Service、Ports
- **Domain** — Entity、Value Object、ドメインルール
- **Infrastructure** — DB、Repository実装、Discordアダプター、設定

守るべき境界:

- Discordイベントハンドラーにビジネスロジックを書かない
- ドメイン層・アプリケーション層は discord.js の型に依存させない
- テーブル構造をRepositoryの外に漏らさない
- FF14固有処理と汎用コミュニティ機能を分ける

## データベースとマイグレーション

Kysely + better-sqlite3を使用し、起動時に未適用のマイグレーションが自動適用される。マイグレーションファイルは `src/infrastructure/database/migrations/` に置く(Kysely Migrator形式、ファイル名順に適用)。

テーブルを追加するときは、マイグレーションと合わせて `src/infrastructure/database/connection.ts` の `DatabaseSchema` に型定義を足す。

## テスト方針

すべてを無理に単体テストする必要はない。優先してテストする対象:

- ドメインルールと不変条件(日程確定ルール、締切・リマインド時刻の計算、権限判定など)
- ユースケースの主要フロー
- Repositoryの主要動作
- 環境変数などの起動時検証

Discord APIとの接続部分は薄く保ち、ドメインやユースケースをDiscordなしでテストできる構成にする。

## 設計判断の記録

覆すコストが高い判断はADRとして記録する。運用ルールは [docs/adr/README.md](adr/README.md) を参照。
