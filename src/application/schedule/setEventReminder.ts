import { ScheduleValidationError } from "../../domain/schedule/errors.js";
import type { EventReminderRepository } from "./ports/reminder.js";

export interface SetEventReminderDeps {
  reminderRepository: EventReminderRepository;
}

export interface SetEventReminderInput {
  readonly eventId: string;
  readonly channelId: string;
  /** JST の0時からの分 (0..1439) */
  readonly remindMinute: number;
}

/** 予定の当日活動リマインドを設定(上書き)して有効化する。 */
export function makeSetEventReminder(
  deps: SetEventReminderDeps,
): (input: SetEventReminderInput) => Promise<void> {
  return async (input) => {
    if (
      !Number.isInteger(input.remindMinute) ||
      input.remindMinute < 0 ||
      input.remindMinute > 1439
    ) {
      throw new ScheduleValidationError([
        `送信時刻が不正です: ${input.remindMinute}`,
      ]);
    }
    await deps.reminderRepository.upsert({
      eventId: input.eventId,
      channelId: input.channelId,
      remindMinute: input.remindMinute,
    });
  };
}
