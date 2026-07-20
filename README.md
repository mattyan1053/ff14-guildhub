# GuildHub

FF14の固定活動を中心とした、Discordコミュニティ向け運営支援Botです。

日程調整・出欠確認・リマインダーなど、固定活動やコミュニティ運営に必要な機能をDiscordサーバー内の「Hub」として集約することを目指しています。詳しくは [docs/product.md](docs/product.md) を参照してください。

> **Status**: 開発初期。Botの起動基盤まで実装済みで、最初の機能(スケジュール調整)は未実装です。

## セルフホスト

Docker Composeで動かします。リポジトリのcloneは不要です。

1. [compose.example.yaml](compose.example.yaml) を `compose.yaml` として保存する
2. 同じディレクトリに `.env` を作成し、`DISCORD_TOKEN` を設定する([.env.example](.env.example) 参照)
3. 起動する

```bash
docker compose up -d
```

データベースは `guildhub-data` ボリュームに保存され、コンテナを更新しても保持されます。詳細は [docs/deployment.md](docs/deployment.md) を参照してください。

## 開発

```bash
corepack enable
pnpm install
cp .env.example .env   # DISCORD_TOKENを設定
pnpm dev
```

コマンド一覧や方針は [docs/development.md](docs/development.md) を参照してください。

## ドキュメント

- [docs/product.md](docs/product.md) — プロダクトの方向性と想定機能
- [docs/development.md](docs/development.md) — 開発環境・コマンド・テスト方針
- [docs/deployment.md](docs/deployment.md) — セルフホスト運用ガイド
- [docs/adr/](docs/adr/README.md) — 設計判断の記録(ADR)

このプロジェクトは「実装とテストが仕様の正」という方針を採っています(詳細は [ADR 0001](docs/adr/0001-implementation-as-source-of-truth.md))。挙動の正確な仕様はコードとテストを参照してください。

## ライセンス

[MIT License](LICENSE)
