---
status: accepted
date: 2026-07-20
tags: [stack, db, tooling]
supersedes: []
superseded-by: []
---

# 0002: 初期技術スタック

> Node.js + TypeScript + discord.js + SQLite(Kysely)+ Biome + Vitest をDockerで配布する。

## Context

GuildHubはDiscordコミュニティ向けの運営支援Botであり、セルフホスト利用者が `docker compose up -d` だけで運用できることを重視する。初期段階は単一プロセス・単一コンテナを前提とし、大規模運用基盤は想定しない。

## Decision

| 領域 | 採用 |
| --- | --- |
| ランタイム / 言語 | Node.js + TypeScript |
| パッケージ管理 | pnpm |
| Discordライブラリ | discord.js |
| データベース | SQLite(better-sqlite3) |
| クエリビルダー | Kysely |
| Formatter / Linter | Biome |
| 型チェック | tsc --noEmit(Biomeとは別に実行) |
| テスト | Vitest |
| 開発実行 | tsx |
| 配布 | Docker(multi-stage build)+ Docker Compose、ghcr.ioでイメージ配布 |

## Consequences

- SQLiteにより、セルフホスト構成が単一コンテナ+Volumeだけで完結する。
- Kyselyを永続化層の境界に置くことで、将来のPostgreSQL移行はdialect切り替え+マイグレーション書き直しの範囲に収まる想定。SQLとPostgreSQLで完全に同一のSQLを維持することよりも、アプリケーション層と永続化層の境界を明確にすることを優先する。
- better-sqlite3はネイティブモジュールのため、Dockerイメージのビルド構成に配慮が必要。

## Alternatives

- **ORM(Prisma / Drizzle)**: Prismaはランタイムが重くセルフホストイメージが肥大化する。型安全なクエリビルダーとしてKyselyで十分と判断。
- **最初からPostgreSQL**: セルフホスト利用者にDBコンテナの運用を強いることになるため、初期は不採用。移行余地だけを残す。
