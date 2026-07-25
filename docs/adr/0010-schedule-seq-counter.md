---
status: accepted
date: 2026-07-26
tags: [architecture, db]
supersedes: []
superseded-by: []
---

# 0010: guild_seq を単調増加カウンタで採番する

> スケジュールの `guild_seq` を「現存イベントの `max(guild_seq)+1`」ではなく、guild ごとの**単調増加カウンタ**(`guild_counters` テーブル)で採番する。カウンタは削除で減らないため、末尾イベントを消してから作り直しても番号を再利用しない。ADR 0004 が決めた「連番はサーバー内で安定・削除で繰り上がらない」を、削除機能(ADR 0009)の下でも実装で保証する。欠番は許容する。

## Context

ADR 0004 は「連番はサーバー内で安定させる(予定削除で番号が繰り上がらない)」と決めていた(0004 Decision / Consequences)。当時は削除機能が無く、採番を `max(guild_seq)+1` で導出しても「既存の最大 + 1」は単調増加と一致していたため、この実装で 0004 の決定を満たせていた。

ADR 0009 で `/schedule delete`(物理削除)を入れたことで、この前提が崩れる:

- `#1 #2 #3` があるとき **末尾の `#3` を削除**すると `max(guild_seq)` は 2 に戻り、次の create が **`#3` を再利用**する。
- 中間の `#2` を削除した場合は `max` が 3 のままなので `#2` は欠番になり再利用は起きない。

つまり `max+1` 採番は「末尾削除でだけ番号を使い回す」非対称な挙動になり、番号での参照(`/schedule show 3` / `/schedule delete 3`、過去に投稿された `#3` のメッセージ)が**別のイベントを指しうる**。削除に確認パネルを付けた(0009)のと同じく、番号の安定性は取り違え防止に効く。

これは 0004 の決定を**覆すのではなく、削除機能の下でも守るための採番機構の変更**である。新しいテーブルとマイグレーションを伴うデータモデル変更(不可逆性が高い)なので記録する。

前提(0002 / 0004)は不変:セルフホスト・単一プロセス・SQLite、将来の PostgreSQL 移行余地を潰さない。

## Decision

### guild ごとの単調増加カウンタ

- `guild_counters(guild_id TEXT PRIMARY KEY, last_seq INTEGER NOT NULL)` を追加する。`guild_seq` は「現存行の max」ではなく、この `last_seq` を **+1 して払い出す**。カウンタは削除で減らないので、一度使った番号は二度と出ない。
- `events` の `(guild_id, guild_seq)` ユニーク制約は残し、二重採番の安全網とする。

### 採番は create の前に払い出す(欠番は許容)

- 採番はイベント作成の**前段**で行う(既存の `createScheduleEvent` ユースケースの構造を維持:採番 → 集約組み立て → 永続化)。リポジトリの採番メソッドは「読むだけ」ではなく **カウンタを +1 して払い出す(副作用あり)** 操作になるため、意味に合わせて `nextGuildSeq` を **`allocateGuildSeq`** に改名する。
- 払い出し後に create が失敗すると、その番号は消費されたまま **欠番**になる。欠番は 0004 / 0009 の方針どおり許容する(番号は連続を保証しない。保証するのは単調増加=再利用しないこと)。
- 払い出しは `INSERT ... ON CONFLICT(guild_id) DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq` の1文で原子的に行う(SQLite / PostgreSQL 双方で表現でき、単一プロセス前提と併せて競合しない)。

### 既存データのバックフィル

- マイグレーションで、既存の全 guild について `last_seq = max(events.guild_seq)` を `guild_counters` にシードする(`INSERT INTO guild_counters SELECT guild_id, max(guild_seq) FROM events GROUP BY guild_id`)。これで既存の番号と衝突せず、次の create から続きの番号になる。
- events を持たない guild は行が無いので、初回 `allocateGuildSeq` の upsert で `last_seq = 1` から始まる。

### 境界

- テーブル構造は Repository の外に漏らさない(ADR 0003)。`allocateGuildSeq` は `ScheduleRepository` ポートのメソッドとして意味(次の安定連番を払い出す)だけを見せ、`guild_counters` の存在は infrastructure に閉じる。application / domain は番号が単調増加であること以上を知らない。

## Consequences

- 末尾を削除して作り直しても番号を再利用しない。`/schedule show <番号>` / `delete <番号>` や過去メッセージの `#N` 参照が、常に同じイベント(または「もう無い」)を指す。0004 の「安定連番」を削除機能の下でも守れる。
- 欠番は残る(中間削除でも末尾削除でも番号は詰めない)。一覧は連番が飛ぶが、番号の一貫性(取り違えの無さ)を優先する。
- 採番が「現存行の集計」から「専用カウンタの状態」に変わり、**カウンタが真実源**になる。カウンタと events が乖離しないよう、バックフィルと create 経路以外でカウンタを触らない。手動で events を消してもカウンタは減らない(むしろ再利用防止として意図どおり)。
- create 失敗時に番号が1つ飛ぶ。即時 upsert で払い出してから永続化するため、失敗・中断はそのまま欠番になる。欠番許容の方針で受け入れる(番号を消費しない厳密さより、実装の単純さ=既存の create フロー維持を採る)。
- `guild_counters` テーブルと1本のマイグレーションが増える。単一行 upsert-returning は PostgreSQL でも同型で書けるため移行余地は保たれる(0002)。
- 採番メソッドが read から allocate(副作用あり)に変わる。名前を `allocateGuildSeq` に改め、fake / kysely 実装と既存テストを追従させる。

## Alternatives

- **`max(guild_seq)+1` のまま(現状)**:末尾削除で番号を再利用し、0004 の安定連番を破る。削除機能が入った以上、維持できない。
- **論理削除(tombstone)にして max+1 を残す**:消したイベントを行として残せば `max` が減らず再利用も起きないが、ADR 0009 で物理削除を選んだ方針と衝突し、一覧/表示/回答/採番の各経路に「除外」フィルタが要る。採番のためだけに論理削除へ寄せるのは過剰。カウンタ1テーブルで足りる。
- **採番を events と同一トランザクションに畳んで欠番も無くす**:create 失敗時に番号を消費しない厳密さは得られるが、`createScheduleEvent` ユースケースと `repository.create` の境界を作り替える必要がある。欠番は元々許容しているため、既存の「採番→組み立て→create」の構造を保つ側を採る。
- **グローバル(guild 非依存)の連番/自動採番**:guild をまたいで番号が混ざり、`/schedule list` の per-guild な番号体験(0004)が壊れる。カウンタは guild ごとに持つ。
- **番号を UUID や作成時刻ベースにする**:人が打てない/長い。0004 で「連番で参照する」と決めた体験を維持する。
