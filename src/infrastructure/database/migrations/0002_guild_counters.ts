// FileMigrationProvider がこのディレクトリの全ファイルを migration として読むため、
// このファイルには named export の up/down のみを置く。
// migration は特定の DatabaseSchema に依存させないため Kysely<any> で書く。
import { sql } from "kysely";

// biome-ignore lint/suspicious/noExplicitAny: migration はスキーマ非依存で書く
type AnyKysely = import("kysely").Kysely<any>;

export const up = async (db: AnyKysely): Promise<void> => {
  await db.schema
    .createTable("guild_counters")
    .addColumn("guild_id", "text", (col) => col.primaryKey())
    .addColumn("last_seq", "integer", (col) => col.notNull())
    .execute();

  // 既存 events の guild ごとの最大連番でカウンタを初期化する(バックフィル)。
  // これにより既存の番号と衝突せず、次の採番から続きの番号になる。
  await sql`
    INSERT INTO guild_counters (guild_id, last_seq)
    SELECT guild_id, max(guild_seq) FROM events GROUP BY guild_id
  `.execute(db);
};

export const down = async (db: AnyKysely): Promise<void> => {
  await db.schema.dropTable("guild_counters").execute();
};
