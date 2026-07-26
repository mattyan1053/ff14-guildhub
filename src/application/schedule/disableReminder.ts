import type { ReminderSettingsRepository } from "./ports/reminder.js";

export interface DisableReminderDeps {
  settingsRepository: ReminderSettingsRepository;
}

/**
 * guild の当日活動リマインドを停止する(設定行を削除=opt-in解除)。
 * 設定が存在したら true、もともと無ければ false を返す。
 */
export function makeDisableReminder(
  deps: DisableReminderDeps,
): (input: { guildId: string }) => Promise<boolean> {
  return async (input) => {
    const existing = await deps.settingsRepository.find(input.guildId);
    if (!existing) {
      return false;
    }
    await deps.settingsRepository.delete(input.guildId);
    return true;
  };
}
