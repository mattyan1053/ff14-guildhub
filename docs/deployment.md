# セルフホスト運用ガイド

## 前提

- Docker / Docker Compose
- Discord Botのトークン([Discord Developer Portal](https://discord.com/developers/applications) で取得)

## セットアップ

1. [compose.example.yaml](../compose.example.yaml) を任意のディレクトリに `compose.yaml` として保存する
2. 同じディレクトリに `.env` を作成する:

```env
DISCORD_TOKEN=<Botトークン>
```

3. 起動する:

```bash
docker compose up -d
```

ログに `discord: ready (logged in as <Bot名>)` が出れば接続成功。

```bash
docker compose logs -f
```

## データの永続化

データベースは名前付きボリューム `guildhub-data`(コンテナ内 `/data`)に保存される。コンテナの再作成・イメージ更新をしてもデータは保持される。

データベースのパスはComposeファイル側で `/data/bot.sqlite3` に固定しており、`.env` で変更する必要はない。

## 更新

```bash
docker compose pull
docker compose up -d
```

未適用のデータベースマイグレーションは、アプリケーション起動時に自動適用される。手動でのマイグレーション操作は不要。

## イメージのタグ

`ghcr.io/mattyan1053/ff14-guildhub` で公開している。

| タグ | 内容 |
| --- | --- |
| `latest` | 最新の安定リリース(推奨) |
| `X.Y.Z` / `X.Y` | 特定のリリースバージョン |
| `edge` | mainブランチの最新(開発版) |
| `sha-*` | 特定コミットのビルド |

## バックアップ

SQLiteのDBファイルをコピーするだけでよい。安全にバックアップするには、Botを停止してからボリュームの内容を取り出す:

```bash
docker compose stop
docker run --rm -v guildhub-data:/data -v "$PWD":/backup alpine cp /data/bot.sqlite3 /backup/
docker compose start
```
