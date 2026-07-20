# コントリビューションガイド

GuildHubへの貢献に興味を持っていただきありがとうございます。バグ報告・機能要望・Pull Requestを歓迎します。

## はじめに

- バグ報告・機能要望は [Issue](https://github.com/mattyan1053/ff14-guildhub/issues) からお願いします
- 大きな変更(新機能、アーキテクチャに関わる変更)は、実装前にIssueで方向性を相談してください
- IssueやPRは日本語・英語のどちらでも構いません

## 開発環境

セットアップ手順とコマンドは [docs/development.md](docs/development.md) を参照してください。

PRを出す前に、以下が通ることを確認してください:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## このプロジェクトの文化

- **実装とテストが仕様の正です**([ADR 0001](docs/adr/0001-implementation-as-source-of-truth.md))。仕様書はありません。挙動を変える場合はテストで表現してください
- **設計判断はADRに記録します**([docs/adr/](docs/adr/README.md))。技術選定やアーキテクチャに関わる変更を提案する場合、ADRの追加を求めることがあります
- **レイヤー境界は機械的に強制されます**。domain / application層からdiscord.jsやDBライブラリはimportできません(dependency-cruiserがCIで検証します)

## コミットとPR

- コミットメッセージ: [gitmoji](https://gitmoji.dev/) プレフィックス + 英語(例: `:sparkles: Add schedule creation command`)
- PR: テンプレートに沿って記載してください。1つのPRは1つの関心事に絞ってください
- CIがすべてpassしていることを確認してください
