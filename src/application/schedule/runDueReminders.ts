import { startsAtFromDateValue } from "../../domain/schedule/datePresets.js";
import { jstClock, planDailyReminder } from "../../domain/schedule/reminder.js";
import type { ScheduleEvent } from "../../domain/schedule/scheduleEvent.js";
import { summarizeResponses } from "../../domain/schedule/summary.js";
import type {
  ReminderDeliveryRepository,
  ReminderNotifier,
  ReminderSettings,
  ReminderSettingsRepository,
} from "./ports/reminder.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";

export interface RunDueRemindersDeps {
  scheduleRepository: ScheduleRepository;
  settingsRepository: ReminderSettingsRepository;
  deliveryRepository: ReminderDeliveryRepository;
  notifier: ReminderNotifier;
  now: () => Date;
  /** 送信失敗の観測用(best effort、未指定なら黙って握りつぶす) */
  onSendError?: (error: unknown) => void;
}

/** 1イベントを判定し、活動ありなら送信する。判定済み記録は送信より先に書く(at-most-once)。 */
async function judgeAndNotify(
  deps: RunDueRemindersDeps,
  settings: ReminderSettings,
  event: ScheduleEvent,
  dateValue: string,
): Promise<void> {
  if (await deps.deliveryRepository.wasJudged(event.id, dateValue)) {
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
    await deps.notifier.sendDailyReminder(settings.channelId, plan, dateValue);
  } catch (error) {
    deps.onSendError?.(error);
  }
}

/**
 * 当日活動リマインドの発火本体(ADR 0011)。毎分tickから呼ばれる。
 * 「設定時刻を過ぎていて、JSTで同じ日のうちに、まだ判定していないイベント」を
 * 判定・送信する。判定は発火時の1回きり。
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

    for (const settings of await deps.settingsRepository.listAll()) {
      if (settings.remindMinute > clock.minute) {
        continue;
      }
      const events =
        await deps.scheduleRepository.listOpenEventsByCandidateDate(
          settings.guildId,
          startsAt,
        );
      for (const event of events) {
        await judgeAndNotify(deps, settings, event, clock.dateValue);
      }
    }
  };
}
