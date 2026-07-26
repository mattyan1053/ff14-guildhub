import type { DailyReminder } from "../../../domain/schedule/reminder.js";

/**
 * 予定ごとの当日活動リマインド設定(ADR 0012)。
 * 行が存在すること自体が「有効」を表し、無効化は削除で行う。
 */
export interface EventReminder {
  readonly eventId: string;
  /** リマインドの送信先チャンネル */
  readonly channelId: string;
  /** 送信時刻。JST の0時からの分 (0..1439) */
  readonly remindMinute: number;
}

/** 発火対象の読み取りモデル。 */
export interface DueEventReminder {
  readonly eventId: string;
  readonly channelId: string;
}

export interface EventReminderRepository {
  upsert(reminder: EventReminder): Promise<void>;
  find(eventId: string): Promise<EventReminder | null>;
  /** 存在しない eventId は no-op */
  delete(eventId: string): Promise<void>;
  /**
   * 発火対象を guild 横断で返す。日付は JST 固定(ADR 0006)なので guild を巡回しない。
   * 条件: リマインド有効 × remindMinute <= minute × status が open ×
   * startsAt と一致する候補日を持つ。
   */
  listDue(startsAt: Date, minute: number): Promise<DueEventReminder[]>;
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
