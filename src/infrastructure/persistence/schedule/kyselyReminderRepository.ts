import type {
  ReminderDeliveryRepository,
  ReminderSettings,
  ReminderSettingsRepository,
} from "../../../application/schedule/ports/reminder.js";
import type { AppDatabase } from "../../database/connection.js";

export interface KyselyReminderRepository {
  readonly settings: ReminderSettingsRepository;
  readonly deliveries: ReminderDeliveryRepository;
}

/**
 * Kysely によるリマインド設定・判定済み記録の実装。
 * テーブル構造はこのモジュールの外へ漏らさない(ドメイン型で受け渡す)。
 */
export function createKyselyReminderRepository(
  db: AppDatabase,
): KyselyReminderRepository {
  return {
    settings: {
      async upsert(settings: ReminderSettings): Promise<void> {
        const iso = new Date().toISOString();
        await db
          .insertInto("reminder_settings")
          .values({
            guild_id: settings.guildId,
            channel_id: settings.channelId,
            remind_minute: settings.remindMinute,
            created_at: iso,
            updated_at: iso,
          })
          .onConflict((oc) =>
            oc.column("guild_id").doUpdateSet({
              channel_id: settings.channelId,
              remind_minute: settings.remindMinute,
              updated_at: iso,
            }),
          )
          .execute();
      },

      async find(guildId: string): Promise<ReminderSettings | null> {
        const row = await db
          .selectFrom("reminder_settings")
          .selectAll()
          .where("guild_id", "=", guildId)
          .executeTakeFirst();
        return row
          ? {
              guildId: row.guild_id,
              channelId: row.channel_id,
              remindMinute: row.remind_minute,
            }
          : null;
      },

      async delete(guildId: string): Promise<void> {
        await db
          .deleteFrom("reminder_settings")
          .where("guild_id", "=", guildId)
          .execute();
      },

      async listAll(): Promise<ReminderSettings[]> {
        const rows = await db
          .selectFrom("reminder_settings")
          .selectAll()
          .execute();
        return rows.map((row) => ({
          guildId: row.guild_id,
          channelId: row.channel_id,
          remindMinute: row.remind_minute,
        }));
      },
    },

    deliveries: {
      async wasJudged(eventId: string, dateValue: string): Promise<boolean> {
        const row = await db
          .selectFrom("reminder_deliveries")
          .select("event_id")
          .where("event_id", "=", eventId)
          .where("date_value", "=", dateValue)
          .executeTakeFirst();
        return row !== undefined;
      },

      async markJudged(
        eventId: string,
        dateValue: string,
        now: Date,
      ): Promise<void> {
        await db
          .insertInto("reminder_deliveries")
          .values({
            event_id: eventId,
            date_value: dateValue,
            judged_at: now.toISOString(),
          })
          .onConflict((oc) => oc.doNothing())
          .execute();
      },
    },
  };
}
