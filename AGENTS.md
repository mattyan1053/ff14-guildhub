# GuildHub

FF14の固定活動を中心としたDiscordコミュニティ向け運営支援Bot。

## ドキュメント方針

- **実装が仕様の正である。** ドキュメントと実装が食い違う場合は、実装(とテスト)を信頼する。
- 設計上の決定・判断は ADR として `docs/adr/` に蓄積する。運用ルールは `docs/adr/README.md` を参照。
- プロダクトの方向性は `docs/product.md`、開発ガイドは `docs/development.md`、セルフホスト運用は `docs/deployment.md`。

## エージェントの振る舞い

- あとから覆すコストが高い判断(技術選定、データモデル、アーキテクチャ境界、外部に見える仕様など)を行う前に、ADRの起票を提案すること。ADRを起票するときは `grill-me` スキルで決定を深掘りしてから書く。
- 新機能・バグ修正の実装では、実装に着手する前に `test-writer` サブエージェントにテストを書かせる(テストファースト)。実装はそのテストを通すことをゴールにする。
- push・PR作成の前に `local-ci` スキルでCI相当のチェックを通す。
- 些細な実装判断はADRにしない。コードとテストで表現する。
- ADRは「決定の記録」であり仕様書ではない。実装の変化にADRを追従させない。決定自体が覆った場合のみ、新しいADRで置き換える(supersede)。

## アーキテクチャ境界(要点)

- Discordイベントハンドラーにビジネスロジックを書かない。Use Case / Application Serviceを呼び出す。
- ドメイン層・アプリケーション層は discord.js の型に依存させない。
- テーブル構造をRepositoryの外に漏らさない。将来のPostgreSQL移行を不必要に難しくしない。
- FF14固有処理と汎用コミュニティ機能を分離する。

## 開発コマンド

利用可能なスクリプトは `package.json` の `scripts` を参照する。

コマンドは開発用composeコンテナ内で実行する(ホストにNode.js/pnpmを前提としない)。`.claude/scripts/dc.sh` がラッパーで、`bot`コンテナが起動中なら`exec`、停止中なら使い捨てコンテナで実行する:

```bash
./.claude/scripts/dc.sh pnpm lint      # 単発
./.claude/scripts/dc.sh pnpm exec vitest run src/foo.test.ts
```

コード変更後は lint / typecheck / test を通すこと。CI相当のチェック一式は `local-ci` スキルでまとめて実行できる。
