import type { DailyReminder } from "../../../domain/schedule/reminder.js";
import type {
  DueEventReminder,
  EventReminder,
  EventReminderRepository,
  ReminderDeliveryRepository,
  ReminderNotifier,
} from "../ports/reminder.js";

/** listDue の呼び出し引数 */
export interface ListDueCall {
  readonly startsAt: Date;
  readonly minute: number;
}

export interface FakeEventReminderRepository extends EventReminderRepository {
  /** テスト用: 設定を直接投入する */
  seed(reminder: EventReminder): void;
  /** テスト用: 保存済み設定の一覧(行が増えていないことの確認用) */
  all(): EventReminder[];
  /**
   * テスト用: listDue が返す発火対象を差し替える。
   * 絞り込み条件(送信時刻・status・候補日)の再現は実 DB のテストに任せ、
   * ここでは「発火対象として引けた集合」だけを表現する。
   */
  setDue(due: readonly DueEventReminder[]): void;
  /** テスト用: listDue の呼び出し引数(呼び出し順) */
  readonly listDueCalls: ListDueCall[];
}

/** Map ベースのインメモリ EventReminderRepository。テストから注入して使う。 */
export function createFakeEventReminderRepository(): FakeEventReminderRepository {
  const byEvent = new Map<string, EventReminder>();
  let due: DueEventReminder[] = [];
  const listDueCalls: ListDueCall[] = [];

  return {
    listDueCalls,

    upsert(reminder: EventReminder): Promise<void> {
      byEvent.set(reminder.eventId, reminder);
      return Promise.resolve();
    },

    find(eventId: string): Promise<EventReminder | null> {
      return Promise.resolve(byEvent.get(eventId) ?? null);
    },

    delete(eventId: string): Promise<void> {
      byEvent.delete(eventId);
      return Promise.resolve();
    },

    listDue(startsAt: Date, minute: number): Promise<DueEventReminder[]> {
      listDueCalls.push({ startsAt, minute });
      return Promise.resolve([...due]);
    },

    seed(reminder: EventReminder): void {
      byEvent.set(reminder.eventId, reminder);
    },

    all(): EventReminder[] {
      return [...byEvent.values()];
    },

    setDue(next: readonly DueEventReminder[]): void {
      due = [...next];
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
