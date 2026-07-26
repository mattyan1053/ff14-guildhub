import type { DailyReminder } from "../../../domain/schedule/reminder.js";
import type {
  ReminderDeliveryRepository,
  ReminderNotifier,
  ReminderSettings,
  ReminderSettingsRepository,
} from "../ports/reminder.js";

export interface FakeReminderSettingsRepository
  extends ReminderSettingsRepository {
  /** テスト用: 設定を直接投入する */
  seed(settings: ReminderSettings): void;
}

/** Map ベースのインメモリ ReminderSettingsRepository。テストから注入して使う。 */
export function createFakeReminderSettingsRepository(): FakeReminderSettingsRepository {
  const byGuild = new Map<string, ReminderSettings>();

  return {
    upsert(settings: ReminderSettings): Promise<void> {
      byGuild.set(settings.guildId, settings);
      return Promise.resolve();
    },

    find(guildId: string): Promise<ReminderSettings | null> {
      return Promise.resolve(byGuild.get(guildId) ?? null);
    },

    delete(guildId: string): Promise<void> {
      byGuild.delete(guildId);
      return Promise.resolve();
    },

    listAll(): Promise<ReminderSettings[]> {
      return Promise.resolve([...byGuild.values()]);
    },

    seed(settings: ReminderSettings): void {
      byGuild.set(settings.guildId, settings);
    },
  };
}

export interface FakeReminderDeliveryRepository
  extends ReminderDeliveryRepository {
  /** テスト用: 判定済みキー "eventId/dateValue" の一覧 */
  judgedKeys(): string[];
}

/** Set ベースのインメモリ ReminderDeliveryRepository。 */
export function createFakeReminderDeliveryRepository(): FakeReminderDeliveryRepository {
  const judged = new Set<string>();
  const keyOf = (eventId: string, dateValue: string): string =>
    `${eventId}/${dateValue}`;

  return {
    wasJudged(eventId: string, dateValue: string): Promise<boolean> {
      return Promise.resolve(judged.has(keyOf(eventId, dateValue)));
    },

    markJudged(eventId: string, dateValue: string, _now: Date): Promise<void> {
      judged.add(keyOf(eventId, dateValue));
      return Promise.resolve();
    },

    judgedKeys(): string[] {
      return [...judged];
    },
  };
}

export interface SentReminder {
  readonly channelId: string;
  readonly reminder: DailyReminder;
  readonly dateValue: string;
}

export interface FakeReminderNotifier extends ReminderNotifier {
  /** テスト用: 成功した送信の記録(呼び出し順) */
  readonly sent: SentReminder[];
  /** テスト用: この channelId への送信を reject させる */
  failChannel(channelId: string): void;
}

/** 送信を記録するだけの ReminderNotifier。failChannel で失敗を注入できる。 */
export function createFakeReminderNotifier(): FakeReminderNotifier {
  const sent: SentReminder[] = [];
  const failing = new Set<string>();

  return {
    sent,

    failChannel(channelId: string): void {
      failing.add(channelId);
    },

    sendDailyReminder(
      channelId: string,
      reminder: DailyReminder,
      dateValue: string,
    ): Promise<void> {
      if (failing.has(channelId)) {
        return Promise.reject(new Error(`send failed: ${channelId}`));
      }
      sent.push({ channelId, reminder, dateValue });
      return Promise.resolve();
    },
  };
}
