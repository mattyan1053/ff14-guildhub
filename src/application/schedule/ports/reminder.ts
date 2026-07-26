import type { DailyReminder } from "../../../domain/schedule/reminder.js";

/** guild ごとの当日活動リマインド設定。行が存在すれば有効(opt-in、ADR 0011)。 */
export interface ReminderSettings {
  readonly guildId: string;
  /** リマインドの送信先チャンネル */
  readonly channelId: string;
  /** 送信時刻。JST の0時からの分 (0..1439) */
  readonly remindMinute: number;
}

export interface ReminderSettingsRepository {
  upsert(settings: ReminderSettings): Promise<void>;
  find(guildId: string): Promise<ReminderSettings | null>;
  /** 存在しない guild は no-op */
  delete(guildId: string): Promise<void>;
  listAll(): Promise<ReminderSettings[]>;
}

/**
 * 「イベント × JST日付」の判定済み記録。二重送信の防止と、
 * 発火後の再判定(pendingで沈黙した日が後からactiveになって送られる等)の防止に使う。
 */
export interface ReminderDeliveryRepository {
  wasJudged(eventId: string, dateValue: string): Promise<boolean>;
  markJudged(eventId: string, dateValue: string, now: Date): Promise<void>;
}

/** リマインドの実送信。discord 層が実装する。 */
export interface ReminderNotifier {
  sendDailyReminder(
    channelId: string,
    reminder: DailyReminder,
    dateValue: string,
  ): Promise<void>;
}
