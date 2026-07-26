import type {
  EventReminder,
  EventReminderRepository,
} from "./ports/reminder.js";

export interface GetEventReminderDeps {
  reminderRepository: EventReminderRepository;
}

/** 予定の当日活動リマインド設定を返す(未設定は null)。 */
export function makeGetEventReminder(
  deps: GetEventReminderDeps,
): (input: { eventId: string }) => Promise<EventReminder | null> {
  return (input) => deps.reminderRepository.find(input.eventId);
}
