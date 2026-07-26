import { formatDateLabel } from "../../domain/schedule/datePresets.js";
import type { DailyReminder } from "../../domain/schedule/reminder.js";
import { hhmm } from "../../domain/schedule/time.js";

/** 当日活動リマインドの投稿本文を組み立てる。 */
export function renderReminderMessage(
  reminder: DailyReminder,
  dateValue: string,
): string {
  const dateLabel = formatDateLabel(dateValue) ?? dateValue;
  const when =
    reminder.startMinute === null
      ? `${dateLabel} 活動予定です(開始時刻の指定はありません)。`
      : `${dateLabel} ${hhmm(reminder.startMinute)}〜 活動予定です。`;
  const lines = [
    `📣 今日の活動リマインド #${reminder.guildSeq}「${reminder.title}」`,
    when,
  ];
  if (reminder.mentionUserIds.length > 0) {
    lines.push(
      `参加: ${reminder.mentionUserIds.map((id) => `<@${id}>`).join(" ")}`,
    );
  }
  return lines.join("\n");
}
