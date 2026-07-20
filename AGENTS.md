# GuildHub

FF14の固定活動を中心としたDiscordコミュニティ向け運営支援Bot。

## ドキュメント方針

- **実装が仕様の正である。** ドキュメントと実装が食い違う場合は、実装(とテスト)を信頼する。
- 設計上の決定・判断は ADR として `docs/adr/` に蓄積する。運用ルールは `docs/adr/README.md` を参照。
- プロダクトの方向性は `docs/product.md`、開発ガイドは `docs/development.md`、セルフホスト運用は `docs/deployment.md`。

## エージェントの振る舞い

- あとから覆すコストが高い判断(技術選定、データモデル、アーキテクチャ境界、外部に見える仕様など)を行う前に、ADRの起票を提案すること。
- 些細な実装判断はADRにしない。コードとテストで表現する。
- ADRは「決定の記録」であり仕様書ではない。実装の変化にADRを追従させない。決定自体が覆った場合のみ、新しいADRで置き換える(supersede)。

## アーキテクチャ境界(要点)

- Discordイベントハンドラーにビジネスロジックを書かない。Use Case / Application Serviceを呼び出す。
- ドメイン層・アプリケーション層は discord.js の型に依存させない。
- テーブル構造をRepositoryの外に漏らさない。将来のPostgreSQL移行を不必要に難しくしない。
- FF14固有処理と汎用コミュニティ機能を分離する。

## 開発コマンド

```bash
pnpm dev        # tsx watchでBotを起動
pnpm build      # tsconfig.build.jsonでdist/へビルド
pnpm start      # ビルド済みアプリケーションの起動
pnpm test       # Vitest
pnpm lint       # Biome(format + lintチェック)
pnpm format     # Biomeフォーマット適用
pnpm typecheck  # tsc --noEmit
```

コード変更後は `pnpm lint && pnpm typecheck && pnpm test` を通すこと。
