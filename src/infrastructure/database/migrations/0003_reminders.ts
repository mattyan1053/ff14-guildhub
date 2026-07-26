// FileMigrationProvider がこのディレクトリの全ファイルを migration として読むため、
// このファイルには named export の up/down のみを置く。
// migration は特定の DatabaseSchema に依存させないため Kysely<any> で書く。
// biome-ignore lint/suspicious/noExplicitAny: migration はスキーマ非依存で書く
type AnyKysely = import("kysely").Kysely<any>;

export const up = async (db: AnyKysely): Promise<void> => {
  // guild ごとの当日活動リマインド設定(ADR 0011)。行が存在すれば有効(opt-in)。
  await db.schema
    .createTable("reminder_settings")
    .addColumn("guild_id", "text", (col) => col.primaryKey())
    .addColumn("channel_id", "text", (col) => col.notNull())
    .addColumn("remind_minute", "integer", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .execute();

  // 「イベント × JST日付」の判定済み記録。二重送信と発火後の再判定を防ぐ。
  await db.schema
    .createTable("reminder_deliveries")
    .addColumn("event_id", "text", (col) =>
      col.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("date_value", "text", (col) => col.notNull())
    .addColumn("judged_at", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("reminder_deliveries_pk", [
      "event_id",
      "date_value",
    ])
    .execute();
};

export const down = async (db: AnyKysely): Promise<void> => {
  await db.schema.dropTable("reminder_deliveries").execute();
  await db.schema.dropTable("reminder_settings").execute();
};
