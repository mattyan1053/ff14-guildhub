import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

// テーブルを追加するときは、マイグレーションと合わせてここに型定義を足す
// biome-ignore lint/suspicious/noEmptyInterface: スキーマは最初の機能実装で追加される
export interface DatabaseSchema {}

export type AppDatabase = Kysely<DatabaseSchema>;

export function createDatabase(filePath: string): AppDatabase {
  if (filePath !== ":memory:") {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const sqlite = new SQLite(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
}
