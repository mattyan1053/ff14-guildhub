import { formatDateLabel } from "../../domain/schedule/datePresets.js";
import type { DailyReminder } from "../../domain/schedule/reminder.js";
import { hhmm } from "../../domain/schedule/time.js";

/**
 * 1通のリマインドでメンションする上限人数。
 * 判定済み記録を書いたあとに送るため(at-most-once)、Discord に本文2000文字や
 * allowedMentions 100件で拒否されるとその日のリマインドが失われる。手前で抑える。
 */
export const MAX_REMINDER_MENTIONS = 50;

/** 実際にメンションする userId。本文と allowedMentions で同じ集合を使う。 */
export function reminderMentionUserIds(reminder: DailyReminder): string[] {
  return reminder.mentionUserIds.slice(0, MAX_REMINDER_MENTIONS);
}

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
  const mentioned = reminderMentionUserIds(reminder);
  if (mentioned.length > 0) {
    const omitted = reminder.mentionUserIds.length - mentioned.length;
    const mentions = mentioned.map((id) => `<@${id}>`).join(" ");
    lines.push(
      omitted > 0 ? `参加: ${mentions} ほか${omitted}名` : `参加: ${mentions}`,
    );
  }
  return lines.join("\n");
}
