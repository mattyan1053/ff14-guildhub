// FileMigrationProvider がこのディレクトリの全ファイルを migration として読むため、
// このファイルには named export の up/down のみを置き、index.ts 等は追加しない。
// migration は特定の DatabaseSchema に依存させないため Kysely<any> で書く。
// biome-ignore lint/suspicious/noExplicitAny: migration はスキーマ非依存で書く
type AnyKysely = import("kysely").Kysely<any>;

export const up = async (db: AnyKysely): Promise<void> => {
  await db.schema
    .createTable("events")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("guild_id", "text", (col) => col.notNull())
    .addColumn("channel_id", "text", (col) => col.notNull())
    .addColumn("message_id", "text")
    .addColumn("creator_id", "text", (col) => col.notNull())
    .addColumn("guild_seq", "integer", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("open"))
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .addUniqueConstraint("events_guild_seq_unique", ["guild_id", "guild_seq"])
    .execute();

  await db.schema
    .createTable("candidates")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("event_id", "text", (col) =>
      col.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("starts_at", "text")
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .addUniqueConstraint("candidates_position_unique", ["event_id", "position"])
    .execute();

  await db.schema
    .createIndex("candidates_event_id_index")
    .on("candidates")
    .column("event_id")
    .execute();

  await db.schema
    .createTable("response_options")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("event_id", "text", (col) =>
      col.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("start_minute", "integer")
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .addUniqueConstraint("response_options_position_unique", [
      "event_id",
      "position",
    ])
    .execute();

  await db.schema
    .createTable("responses")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("event_id", "text", (col) =>
      col.notNull().references("events.id").onDelete("cascade"),
    )
    .addColumn("candidate_id", "text", (col) =>
      col.notNull().references("candidates.id").onDelete("cascade"),
    )
    .addColumn("response_option_id", "text", (col) =>
      col.notNull().references("response_options.id").onDelete("cascade"),
    )
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .addUniqueConstraint("responses_candidate_user_unique", [
      "candidate_id",
      "user_id",
    ])
    .execute();

  await db.schema
    .createIndex("responses_event_id_index")
    .on("responses")
    .column("event_id")
    .execute();
};

export const down = async (db: AnyKysely): Promise<void> => {
  await db.schema.dropTable("responses").execute();
  await db.schema.dropTable("response_options").execute();
  await db.schema.dropTable("candidates").execute();
  await db.schema.dropTable("events").execute();
};
