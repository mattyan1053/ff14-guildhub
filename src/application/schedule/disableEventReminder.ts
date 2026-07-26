import type { EventReminderRepository } from "./ports/reminder.js";

export interface DisableEventReminderDeps {
  reminderRepository: EventReminderRepository;
}

/**
 * 予定の当日活動リマインドを停止する(設定行を削除)。
 * 設定が存在したら true、もともと無ければ false を返す。
 */
export function makeDisableEventReminder(
  deps: DisableEventReminderDeps,
): (input: { eventId: string }) => Promise<boolean> {
  return async (input) => {
    const existing = await deps.reminderRepository.find(input.eventId);
    if (!existing) {
      return false;
    }
    await deps.reminderRepository.delete(input.eventId);
    return true;
  };
}
