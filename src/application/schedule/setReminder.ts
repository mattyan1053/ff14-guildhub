import { ScheduleValidationError } from "../../domain/schedule/errors.js";
import type { ReminderSettingsRepository } from "./ports/reminder.js";

export interface SetReminderDeps {
  settingsRepository: ReminderSettingsRepository;
}

export interface SetReminderInput {
  readonly guildId: string;
  readonly channelId: string;
  /** JST の0時からの分 (0..1439) */
  readonly remindMinute: number;
}

/** guild の当日活動リマインド設定を保存(上書き)する。 */
export function makeSetReminder(
  deps: SetReminderDeps,
): (input: SetReminderInput) => Promise<void> {
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
    await deps.settingsRepository.upsert({
      guildId: input.guildId,
      channelId: input.channelId,
      remindMinute: input.remindMinute,
    });
  };
}
