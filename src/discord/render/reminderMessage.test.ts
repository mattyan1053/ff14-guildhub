import { describe, expect, it } from "vitest";
import type { DailyReminder } from "../../domain/schedule/reminder.js";
import { renderReminderMessage } from "./reminderMessage.js";

// 2026-07-27 は月曜(formatDateLabel 表記で "7/27(月)")
const DATE_VALUE = "2026-07-27";

function reminder(overrides: Partial<DailyReminder> = {}): DailyReminder {
  return {
    eventId: "event-1",
    guildSeq: 3,
    title: "固定練習",
    startMinute: 21 * 60 + 30,
    mentionUserIds: ["u1", "u2"],
    ...overrides,
  };
}

describe("renderReminderMessage", () => {
  it("開始時刻とメンション対象があれば3行で組み立てる", () => {
    const text = renderReminderMessage(reminder(), DATE_VALUE);

    expect(text).toBe(
      [
        "📣 今日の活動リマインド #3「固定練習」",
        "7/27(月) 21:30〜 活動予定です。",
        "参加: <@u1> <@u2>",
      ].join("\n"),
    );
  });

  it("startMinute が null なら「開始時刻の指定はありません」表記にする", () => {
    const text = renderReminderMessage(
      reminder({ startMinute: null }),
      DATE_VALUE,
    );

    expect(text.split("\n")[1]).toBe(
      "7/27(月) 活動予定です(開始時刻の指定はありません)。",
    );
  });

  it("メンション対象が空なら参加行を出さない", () => {
    const text = renderReminderMessage(
      reminder({ mentionUserIds: [] }),
      DATE_VALUE,
    );

    expect(text).toBe(
      [
        "📣 今日の活動リマインド #3「固定練習」",
        "7/27(月) 21:30〜 活動予定です。",
      ].join("\n"),
    );
  });

  it("開始時刻は hhmm でゼロ埋めされる", () => {
    const text = renderReminderMessage(
      reminder({ startMinute: 9 * 60 + 5 }),
      DATE_VALUE,
    );

    expect(text.split("\n")[1]).toBe("7/27(月) 09:05〜 活動予定です。");
  });
});
