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
| [0004](0004-schedule-coordination-model.md) | 候補日ごとに各メンバーの参加可能な開始時刻(いつでも/主催定義の時刻から/未定/不可)を回答パネルで集め、日ごとに開始時刻別の参加可能人数を集計するDiscord完結型の日程調整 | accepted | architecture, db, feature |
| [0005](0005-schedule-create-builder.md) | `/schedule create` の入力を、JST固定のプリセットをセレクトで選ぶエフェメラルの対話ビルダーへ置き換える。途中状態はサーバーに持たず、パネル自身のコンポーネント値を真実源にする | superseded | architecture, feature |
| [0006](0006-schedule-create-calendar.md) | `/schedule create` の候補日を、今日起点の7日窓を週ごとにページングするトグルボタン(初期未選択)にし、選択済み候補日はEmbedのフィールドに保持する。時刻・作成フロー等は0005を引き継ぐ | superseded | architecture, feature |
| [0007](0007-schedule-create-flow.md) | `/schedule create` を入力順(タイトル→説明→候補日→時刻)の1枚パネルにする。候補日は週カレンダーで「期間を範囲タップ→個別に除外」、時刻は既定○△✖で任意にモーダル追加、タイトル/説明はパネル内ボタン、選択はEmbedにプレビュー | accepted | architecture, feature |
| [0008](0008-schedule-answer-panel.md) | 回答を、自分の回答をカレンダーでプレビューするエフェメラルの下書きパネルにする。デフォルト参加可(未入力=いつでも)とし、不可/未定/時刻の例外だけを「週送りの日ボタンで対象日を選ぶ→適用selectで種別を選ぶ」でマーク。パネル自身を下書きの真実源とし、「完了」で全候補を一括upsert(例外はその種別・残りはyes)して初めて保存・公開更新する。語彙はADR0004のまま | accepted | architecture, feature |
| [0009](0009-schedule-delete.md) | `/schedule delete <番号>` で日程調整を物理削除する。cascadeで候補・選択肢・回答も消す。実行できるのは作成者本人またはManageEvents権限保持者。確認ボタン(ephemeral)を1段挟み、確定時に公開メッセージもbest-effortで削除する。guild_seqの欠番は許容し番号は再利用しない | accepted | architecture, feature, db |
| [0010](0010-schedule-seq-counter.md) | guild_seqを「現存行のmax+1」ではなくguildごとの単調増加カウンタ(guild_countersテーブル)で採番する。削除で減らないため末尾削除→再作成でも番号を再利用しない。ADR 0004の「安定連番」を削除機能(0009)の下でも実装で保証する。欠番は許容 | accepted | architecture, db |
| [0011](0011-daily-activity-reminder.md) | guildごとにopt-inで設定した時刻(JST)に、その日が活動あり(active / active-anytime)の日程調整をイベントごとに1通、guild設定のリマインドチャンネルへ自動投稿し、回答履歴のあるユーザーを参加者としてメンションする。croner による毎分tick + DBの判定済み記録で「設定時刻を過ぎて当日未判定なら判定・送信する」を実現し、判定は発火時の1回きりとする | superseded | architecture, db, feature, stack |
| [0012](0012-per-schedule-reminder.md) | 当日活動リマインドの設定(有効/無効・送信時刻・送信先チャンネル)をguild単位ではなく予定ごとに持たせ、`event_reminders` テーブル(event_id主キー、行の有無が有効/無効)で表す。既定は無効で、作成パネルの「リマインド」ボタン(時刻のみ、送信先は作成チャンネル)または `/schedule remind <番号>` で有効化する。判定ロジック・croner毎分tick・判定済み記録・メンション方針はADR 0011から引き継ぐ | accepted | architecture, db, feature |
