---
status: accepted
date: 2026-07-20
tags: [architecture]
supersedes: []
superseded-by: []
---

# 0003: レイヤードアーキテクチャとDiscord非依存のコア

> Discord / Application / Domain / Infrastructure の4層に分離し、コアをdiscord.js非依存にする。

## Context

GuildHubはDiscord Botとして始まるが、以下の将来変化に備えたい。

- Gateway接続とHTTP Interactions Endpointの両対応
- FF14以外のゲームや一般Discordコミュニティへの展開
- SQLiteからPostgreSQLへの移行

同時に、現時点で過剰な汎用化・過剰設計は避けたい。

## Decision

責務を以下の4層に分離する。ディレクトリ構成はこの通りである必要はないが、責務の混在を禁止する。

- **Discord Interface**: Gatewayイベント、Interactions、コマンド、Components/Modals
- **Application**: Use Case、Service、Ports
- **Domain**: Entity、Value Object、ドメインルール
- **Infrastructure**: DB、Repository実装、Discordアダプター、設定

具体的な制約:

- ドメイン層・アプリケーション層は discord.js の型に依存しない。
- Discordイベントハンドラーにビジネスロジックを書かない。共通のUse Caseを呼び出す。
- Repositoryはテーブル構造ではなくドメイン操作を表現するインターフェースとする。
- FF14固有機能は汎用コミュニティ機能と分離したモジュールに置く。

## Consequences

- ドメイン・ユースケースをDiscordなしで単体テストできる。
- Gateway/HTTP Interactionsの切り替えがInterface層の差し替えで済む。
- 層をまたぐ変換コード(DTOやアダプター)が一定量発生することを受け入れる。

## Alternatives

- **フラットな構成(ハンドラーに直接実装)**: 初速は出るが、テスト困難とDiscord API依存の拡散により早期に破綻するため不採用。
- **マイクロサービス / プラグインアーキテクチャ**: 現時点の規模に対して過剰。実際に必要になるまで採用しない。
