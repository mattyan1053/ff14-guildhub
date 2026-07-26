import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

// テーブルを追加するときは、マイグレーションと合わせてここに型定義を足す。
// INSERT/UPDATE の値はアプリ層が明示するため Generated<> は使わない。
interface EventsTable {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  creator_id: string;
  guild_seq: number;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CandidatesTable {
  id: string;
  event_id: string;
  label: string;
  starts_at: string | null;
  position: number;
  created_at: string;
}

interface ResponseOptionsTable {
  id: string;
  event_id: string;
  label: string;
  kind: string;
  start_minute: number | null;
  position: number;
  created_at: string;
}

interface ResponsesTable {
  id: string;
  event_id: string;
  candidate_id: string;
  response_option_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface GuildCountersTable {
  guild_id: string;
  last_seq: number;
}

interface ReminderSettingsTable {
  guild_id: string;
  channel_id: string;
  remind_minute: number;
  created_at: string;
  updated_at: string;
}

interface ReminderDeliveriesTable {
  event_id: string;
  date_value: string;
  judged_at: string;
}

export interface DatabaseSchema {
  events: EventsTable;
  candidates: CandidatesTable;
  response_options: ResponseOptionsTable;
  responses: ResponsesTable;
  guild_counters: GuildCountersTable;
  reminder_settings: ReminderSettingsTable;
  reminder_deliveries: ReminderDeliveriesTable;
}

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
