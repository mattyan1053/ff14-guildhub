import type {
  ReminderSettings,
  ReminderSettingsRepository,
} from "./ports/reminder.js";

export interface GetReminderSettingsDeps {
  settingsRepository: ReminderSettingsRepository;
}

/** guild の当日活動リマインド設定を返す(未設定は null)。 */
export function makeGetReminderSettings(
  deps: GetReminderSettingsDeps,
): (input: { guildId: string }) => Promise<ReminderSettings | null> {
  return (input) => deps.settingsRepository.find(input.guildId);
}
