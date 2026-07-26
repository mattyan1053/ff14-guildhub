import { startsAtFromDateValue } from "../../domain/schedule/datePresets.js";
import { jstClock, planDailyReminder } from "../../domain/schedule/reminder.js";
import { summarizeResponses } from "../../domain/schedule/summary.js";
import type {
  DueEventReminder,
  EventReminderRepository,
  ReminderDeliveryRepository,
  ReminderNotifier,
} from "./ports/reminder.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";

export interface RunDueRemindersDeps {
  scheduleRepository: ScheduleRepository;
  reminderRepository: EventReminderRepository;
  deliveryRepository: ReminderDeliveryRepository;
  notifier: ReminderNotifier;
  now: () => Date;
  /** 送信失敗の観測用(best effort、未指定なら黙って握りつぶす) */
  onSendError?: (error: unknown) => void;
}

/** 1件を判定し、活動ありなら送信する。判定済み記録は送信より先に書く(at-most-once)。 */
async function judgeAndNotify(
  deps: RunDueRemindersDeps,
  due: DueEventReminder,
  dateValue: string,
): Promise<void> {
  if (await deps.deliveryRepository.wasJudged(due.eventId, dateValue)) {
    return;
  }
  const event = await deps.scheduleRepository.findById(due.eventId);
  if (!event) {
    return;
  }
  const responses = await deps.scheduleRepository.listResponses(event.id);
  const plan = planDailyReminder(
    summarizeResponses(event, responses),
    dateValue,
  );
  await deps.deliveryRepository.markJudged(event.id, dateValue, deps.now());
  if (!plan) {
    return;
  }
  try {
    await deps.notifier.sendDailyReminder(due.channelId, plan, dateValue);
  } catch (error) {
    deps.onSendError?.(error);
  }
}

/**
 * 当日活動リマインドの発火本体(ADR 0011 の判定を ADR 0012 の予定単位設定で引く)。
 * 毎分tickから呼ばれ、「設定時刻を過ぎていて、JSTで同じ日のうちに、まだ判定して
 * いない予定」を判定・送信する。判定は発火時の1回きり。
 */
export function makeRunDueReminders(
  deps: RunDueRemindersDeps,
): () => Promise<void> {
  return async () => {
    const clock = jstClock(deps.now());
    const startsAt = startsAtFromDateValue(clock.dateValue);
    if (!startsAt) {
      return;
    }
    const dues = await deps.reminderRepository.listDue(startsAt, clock.minute);
    for (const due of dues) {
      await judgeAndNotify(deps, due, clock.dateValue);
    }
  };
}
