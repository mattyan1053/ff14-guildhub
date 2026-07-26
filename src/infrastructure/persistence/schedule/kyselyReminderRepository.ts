import type {
  DueEventReminder,
  EventReminder,
  EventReminderRepository,
  ReminderDeliveryRepository,
} from "../../../application/schedule/ports/reminder.js";
import type { AppDatabase } from "../../database/connection.js";

export interface KyselyReminderRepository {
  readonly reminders: EventReminderRepository;
  readonly deliveries: ReminderDeliveryRepository;
}

/**
 * Kysely による予定ごとのリマインド設定・判定済み記録の実装。
 * テーブル構造はこのモジュールの外へ漏らさない(ドメイン型で受け渡す)。
 */
export function createKyselyReminderRepository(
  db: AppDatabase,
): KyselyReminderRepository {
  return {
    reminders: {
      async upsert(reminder: EventReminder): Promise<void> {
        const iso = new Date().toISOString();
        await db
          .insertInto("event_reminders")
          .values({
            event_id: reminder.eventId,
            channel_id: reminder.channelId,
            remind_minute: reminder.remindMinute,
            created_at: iso,
            updated_at: iso,
          })
          .onConflict((oc) =>
            oc.column("event_id").doUpdateSet({
              channel_id: reminder.channelId,
              remind_minute: reminder.remindMinute,
              updated_at: iso,
            }),
          )
          .execute();
      },

      async find(eventId: string): Promise<EventReminder | null> {
        const row = await db
          .selectFrom("event_reminders")
          .selectAll()
          .where("event_id", "=", eventId)
          .executeTakeFirst();
        return row
          ? {
              eventId: row.event_id,
              channelId: row.channel_id,
              remindMinute: row.remind_minute,
            }
          : null;
      },

      async delete(eventId: string): Promise<void> {
        await db
          .deleteFrom("event_reminders")
          .where("event_id", "=", eventId)
          .execute();
      },

      async listDue(
        startsAt: Date,
        minute: number,
      ): Promise<DueEventReminder[]> {
        // guild では絞らない。日付は JST 固定(ADR 0006)で全 guild 共通のため。
        const rows = await db
          .selectFrom("event_reminders")
          .innerJoin("events", "events.id", "event_reminders.event_id")
          .select([
            "event_reminders.event_id",
            "event_reminders.channel_id as reminder_channel_id",
          ])
          .where("event_reminders.remind_minute", "<=", minute)
          .where("events.status", "=", "open")
          .where(({ exists, selectFrom }) =>
            exists(
              selectFrom("candidates")
                .select("candidates.id")
                .whereRef("candidates.event_id", "=", "events.id")
                .where("candidates.starts_at", "=", startsAt.toISOString()),
            ),
          )
          .orderBy("events.guild_seq", "asc")
          .execute();
        return rows.map((row) => ({
          eventId: row.event_id,
          channelId: row.reminder_channel_id,
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
