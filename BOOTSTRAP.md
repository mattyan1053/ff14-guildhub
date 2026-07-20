# GuildHub Initial Project Context

> このファイルはプロジェクト初期化用の一時的なコンテキストです。
> リポジトリ構成、設計方針、開発ルールが正式なドキュメントへ整理された後に削除してください。

## Project Overview

GuildHubは、FF14の固定活動を中心としたDiscordコミュニティ向けの運営支援Botです。

最初の主要機能はスケジュール調整ですが、単なる日程調整Botではなく、固定活動やコミュニティ運営に必要な機能を集約することを目指します。

想定する用途には以下が含まれます。

* 固定活動の日程調整
* 出欠確認
* リマインダー
* 投票
* 募集
* 連絡事項
* 攻略活動の進捗管理
* メンバー管理
* オフ会や食事会など、レイド以外の予定調整
* 将来的な活動履歴や各種記録

プロダクト名は `GuildHub`、リポジトリ名は `ff14-guildhub` とします。

## Product Direction

GuildHubは、Discordサーバー内の活動をまとめる「Hub」として設計します。

FF14の固定活動を最初の対象としますが、内部設計は可能な限りFF14固有の概念へ強く依存させないでください。

次のような分離を意識してください。

* Discord固有の処理
* アプリケーションのユースケース
* ドメインモデル
* 永続化処理
* FF14固有機能

将来的に、他ゲームや一般的なDiscordコミュニティでも使える余地を残します。

ただし、現時点で過剰な汎用化は行わないでください。

## Initial Feature

最初に実装する機能はスケジュール調整です。

想定する基本フローは以下です。

1. ユーザーがDiscord上で予定を作成する
2. 候補日時を複数登録する
3. メンバーが各候補日時に対して回答する
4. 回答状況をDiscord上で確認する
5. 必要に応じて予定を確定する
6. 開催前にリマインドする

Discordネイティブな操作体験を優先します。

利用予定のDiscord UIは以下です。

* Application Commands
* Components V2
* Buttons
* Select Menus
* Modals

Discord Activityの採用は現時点では見送ります。

Componentsだけでは操作性が不足すると判断した場合に、将来的な選択肢として検討します。

## Technical Stack

初期技術スタックは以下を基本とします。

### Runtime and Language

* Node.js
* TypeScript
* pnpm

### Discord

* discord.js

### Database

* SQLite
* better-sqlite3
* Kysely

将来的にはPostgreSQLへ移行できる構成にします。

### Development Tools

* Biome
* TypeScript Compiler
* Vitest
* tsx

BiomeはFormatterおよびLinterとして使用します。

型チェックはBiomeとは別に、以下を実行します。

```bash
tsc --noEmit
```

### Container

* Docker
* Docker Compose

## Database Architecture

初期データベースはSQLiteを使用します。

データベースファイルの配置先は以下を基本とします。

```text
/data/bot.sqlite3
```

Docker Volumeを `/data` にマウントし、コンテナを再作成してもデータが保持される構成にしてください。

将来的なPostgreSQL対応を考慮し、アプリケーションコードがSQLite固有実装へ強く依存しないようにしてください。

環境変数は、たとえば以下の形式を想定します。

```env
DATABASE_DIALECT=sqlite
DATABASE_URL=file:/data/bot.sqlite3
```

将来的には以下のように切り替えられる構成を目指します。

```env
DATABASE_DIALECT=postgres
DATABASE_URL=postgresql://...
```

SQLiteとPostgreSQLで完全に同一のSQLを維持することより、アプリケーション層と永続化層の境界を明確にすることを優先してください。

## Migration Policy

データベースマイグレーションはプロジェクト初期から導入します。

コンテナ起動時には、アプリケーション起動前に未適用のマイグレーションを自動適用する構成を目指します。

利用者の基本操作は以下だけで済むようにしてください。

```bash
docker compose pull
docker compose up -d
```

手動でのマイグレーション操作を通常運用の前提にしないでください。

## Application Architecture

ドメイン層およびアプリケーション層は、discord.jsの型へ直接依存させないでください。

おおまかな責務分割は以下を想定します。

```text
Discord Interface
  ├─ Gateway Events
  ├─ Interactions
  ├─ Commands
  └─ Components / Modals

Application
  ├─ Use Cases
  ├─ Services
  └─ Ports

Domain
  ├─ Entities
  ├─ Value Objects
  └─ Domain Rules

Infrastructure
  ├─ Database
  ├─ Repositories
  ├─ Discord Adapters
  └─ Configuration
```

厳密にこのディレクトリ構成へ従う必要はありません。

重要なのは、Discord API、ユースケース、ドメイン、データベースの責務を混在させないことです。

## Repository Design

汎用的なKey-Value Storeとして抽象化するのではなく、ドメインの操作を表現するRepositoryを定義してください。

たとえば以下のようなインターフェースを想定します。

```ts
interface ScheduleRepository {
  findById(id: ScheduleId): Promise<Schedule | null>;
  save(schedule: Schedule): Promise<void>;
  delete(id: ScheduleId): Promise<void>;
}
```

実際のメソッドはユースケースに応じて調整してください。

Repositoryは、テーブル構造をそのまま公開するのではなく、アプリケーションが必要とする操作を表現してください。

## Discord Transport

将来的に以下の2種類のDiscord接続方式を共有可能な構成にします。

* GatewayベースのBot
* HTTP Interactions Endpoint

現時点ではGateway接続から始めて構いません。

ただし、Discordイベント処理内にビジネスロジックを直接書かず、共通のApplication ServiceまたはUse Caseを呼び出す構成にしてください。

## Docker Architecture

Dockerfileは以下のステージ構成を基本とします。

```text
base
  ↓
dev
  ↓
build
  ↓
runtime
```

Multi-stage buildは、開発用イメージと本番用イメージの内容を分離するために使用します。

開発環境と本番環境の実行方法の違いは、主にDocker Compose側で表現してください。

### Repository Compose

リポジトリ直下の `compose.yaml` は開発用途とします。

想定する内容は以下です。

* Dockerfileのdev stageを使用
* ソースコードをbind mount
* 開発用コマンドを実行
* 開発用SQLite Volumeを使用

### Distribution Compose

セルフホスト利用者はリポジトリをcloneせず、配布されたComposeファイルと `.env` のみで起動できる形を目指します。

利用者向けには、たとえば以下を配布します。

```text
compose.example.yaml
.env.example
```

利用者向けComposeは、ビルドではなく公開済みイメージを参照します。

```yaml
services:
  guildhub:
    image: ghcr.io/<owner>/ff14-guildhub:<tag>
```

利用者が実行する基本操作は以下です。

```bash
docker compose up -d
```

Composeによるイメージの自動取得を前提とします。

## Configuration

秘密情報や環境依存値は環境変数から読み込みます。

少なくとも以下を想定します。

```env
DISCORD_TOKEN=
DISCORD_APPLICATION_ID=
DATABASE_DIALECT=sqlite
DATABASE_URL=file:/data/bot.sqlite3
```

必要に応じて追加してください。

環境変数の検証は起動時に行い、不足や不正な値がある場合は明確なエラーメッセージを出して終了してください。

## Quality Requirements

最低限、以下のコマンドを用意してください。

```bash
pnpm dev
pnpm build
pnpm start
pnpm test
pnpm lint
pnpm format
pnpm typecheck
```

想定する役割は以下です。

```text
dev       開発サーバーまたはBotのwatch実行
build     TypeScriptのビルド
start     ビルド済みアプリケーションの起動
test      Vitestの実行
lint      Biomeによる静的チェック
format    Biomeによるフォーマット
typecheck tsc --noEmit
```

CIでは少なくとも以下を実行できる状態にしてください。

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Testing Policy

すべてを無理に単体テストする必要はありません。

優先してテストする対象は以下です。

* 日程候補の作成と変更
* 回答の登録と更新
* 日程確定ルール
* 締切やリマインド時刻の計算
* 権限判定
* ドメイン上の不変条件
* Repositoryの主要動作

Discord APIとの接続部分は薄く保ち、ドメインやユースケースをDiscordなしでテストできる構成にしてください。

## Initial Repository Setup

まずは、以下を実施してください。

1. TypeScriptプロジェクトを初期化する
2. pnpmを使用する
3. discord.jsを導入する
4. Biomeを導入する
5. Vitestを導入する
6. Kyselyとbetter-sqlite3を導入する
7. 環境変数の読み込みと検証を実装する
8. Dockerfileを作成する
9. 開発用 `compose.yaml` を作成する
10. `.env.example` を作成する
11. SQLiteの初回マイグレーションを作成する
12. Botが起動し、Discordへ接続できる最小構成を作る
13. ヘルスチェックまたは起動確認手段を用意する
14. CIでlint、typecheck、test、buildを実行できる状態にする

最初からスケジュール調整機能をすべて実装する必要はありません。

まずは、今後の機能追加に耐えられる最小限の土台を作ってください。

## Implementation Principles

* 過剰設計を避ける
* ただし責務境界は曖昧にしない
* Discordイベントハンドラーへビジネスロジックを書かない
* データベースのテーブル構造をアプリケーション全体へ漏らさない
* 将来のPostgreSQL移行を不必要に難しくしない
* FF14固有処理と汎用コミュニティ機能を分ける
* 利用者のセルフホスト手順を簡単に保つ
* コンテナイメージを配布単位とする
* 初期段階では単一プロセス、単一コンテナを基本とする
* Kubernetesなどの大規模な運用基盤は前提にしない
* 実際に必要になるまでマイクロサービス化しない

## Documentation

プロジェクトが安定してきたら、このファイルの内容を以下のような正式ドキュメントへ分割してください。

```text
README.md
docs/
  architecture.md
  development.md
  deployment.md
  database.md
  product.md
```

Claude向けの恒久的な指示が必要な場合は、整理後に簡潔な `CLAUDE.md` を再作成してください。

正式ドキュメントへの移行が完了したら、この初期コンテキストファイルは削除してください。

