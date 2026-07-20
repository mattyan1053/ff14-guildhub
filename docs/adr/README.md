# Architecture Decision Records (ADR)

このディレクトリには、GuildHubの設計上の決定・判断を記録する。

## 基本方針

- **実装が仕様の正である。** ADRは実装の説明書ではなく、「なぜそう決めたか」の記録である。
- ADRは決定時点のスナップショットとして扱い、**あとから本文を書き換えない**。
- 決定が覆った場合は、既存ADRを編集するのではなく、新しいADRを作成する。編集してよいのは古いADRのフロントマター(`status` と `superseded-by`)のみ。

## ADRを書く基準

書く:

- 技術選定(ライブラリ、ミドルウェア、インフラ)
- データモデルやマイグレーションに関わる不可逆性の高い判断
- アーキテクチャ境界・レイヤー構成の変更
- 外部に見える仕様(コマンド体系、配布形態、互換性)に関わる判断
- 複数の選択肢を比較して、どれを選んでも妥当だったが1つに決めた判断

書かない:

- 実装の詳細(命名、関数分割、軽微なリファクタリング)
- コードとテストを読めば自明なこと

## 運用

- ファイル名: `NNNN-短いケバブケース.md`(4桁連番)
- テンプレート: [template.md](template.md)
- 各ADRの先頭にYAMLフロントマター(`status` / `date` / `tags` / `supersedes` / `superseded-by`)を置く
- `status`: `proposed` → `accepted` / `rejected`、覆されたら `superseded`
- タイトル直下に決定の一文サマリーを書き、下の一覧にも転記する
- ADRを追加・supersedeしたら、必ず下の一覧を更新する

## 過去の経緯を遡るとき

1. まず下の一覧を読む(全ADRの決定内容を1枚で俯瞰できる)
2. トピックで絞りたいときはフロントマターの `tags` をgrepする
3. 特定トピックの変遷を追うときは `supersedes` / `superseded-by` のチェーンを辿る

## 一覧

| ADR | 決定 | Status | Tags |
| --- | --- | --- | --- |
| [0001](0001-implementation-as-source-of-truth.md) | 仕様書を正とせず、実装とテストを仕様の正とする。判断のみADRに記録する | accepted | process |
| [0002](0002-initial-tech-stack.md) | Node.js + TypeScript + discord.js + SQLite(Kysely)+ Biome + Vitest をDockerで配布する | accepted | stack, db, tooling |
| [0003](0003-layered-architecture.md) | Discord / Application / Domain / Infrastructure の4層に分離し、コアをdiscord.js非依存にする | accepted | architecture |
