import { describe, expect, it } from "vitest";
import type { DailyReminder } from "../../domain/schedule/reminder.js";
import {
  MAX_REMINDER_MENTIONS,
  reminderMentionUserIds,
  renderReminderMessage,
} from "./reminderMessage.js";

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

/** 一意な18桁スノーフレークを count 件つくる(実際のユーザーIDと同じ桁数)。 */
function snowflakes(count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    String(100000000000000000n + BigInt(i)),
  );
}

/** 参加行(3行目)。参加行がなければ undefined。 */
function mentionLine(text: string): string | undefined {
  return text.split("\n")[2];
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

describe("MAX_REMINDER_MENTIONS", () => {
  it("上限は50件で、allowedMentions の上限100件に収まる", () => {
    // 実装が上限値を変えたら本文長・allowedMentions の前提が崩れるため固定値で固定する。
    expect(MAX_REMINDER_MENTIONS).toBe(50);
    expect(MAX_REMINDER_MENTIONS).toBeLessThanOrEqual(100);
  });
});

describe("reminderMentionUserIds", () => {
  it("上限以下ならすべて同じ順序で返す", () => {
    const ids = snowflakes(MAX_REMINDER_MENTIONS - 1);

    const actual = reminderMentionUserIds(reminder({ mentionUserIds: ids }));

    expect(actual).toEqual(ids);
  });

  it("上限ちょうどならすべて返す", () => {
    const ids = snowflakes(MAX_REMINDER_MENTIONS);

    const actual = reminderMentionUserIds(reminder({ mentionUserIds: ids }));

    expect(actual).toEqual(ids);
  });

  it("上限を超えたら先頭から上限件だけを順序を保って返す", () => {
    const ids = snowflakes(MAX_REMINDER_MENTIONS + 3);

    const actual = reminderMentionUserIds(reminder({ mentionUserIds: ids }));

    expect(actual).toEqual(ids.slice(0, MAX_REMINDER_MENTIONS));
  });

  it("メンション対象が空なら空配列を返す", () => {
    const actual = reminderMentionUserIds(reminder({ mentionUserIds: [] }));

    expect(actual).toEqual([]);
  });

  it("大量の回答者がいても allowedMentions の上限100件を超えない", () => {
    const actual = reminderMentionUserIds(
      reminder({ mentionUserIds: snowflakes(200) }),
    );

    expect(actual.length).toBeLessThanOrEqual(100);
  });
});

describe("renderReminderMessage のメンション上限", () => {
  it("上限ちょうどなら全員をメンションし「ほか」を付けない", () => {
    const ids = snowflakes(MAX_REMINDER_MENTIONS);

    const text = renderReminderMessage(
      reminder({ mentionUserIds: ids }),
      DATE_VALUE,
    );

    expect(mentionLine(text)).toBe(
      `参加: ${ids.map((id) => `<@${id}>`).join(" ")}`,
    );
    expect(text).not.toContain("ほか");
  });

  it("上限を1人超えたら先頭50件のメンションと「ほか1名」を出す", () => {
    const ids = snowflakes(MAX_REMINDER_MENTIONS + 1);

    const text = renderReminderMessage(
      reminder({ mentionUserIds: ids }),
      DATE_VALUE,
    );

    expect(mentionLine(text)).toBe(
      `参加: ${ids
        .slice(0, MAX_REMINDER_MENTIONS)
        .map((id) => `<@${id}>`)
        .join(" ")} ほか1名`,
    );
  });

  it("上限を3人超えたら先頭50件のメンションと「ほか3名」を出す", () => {
    const ids = snowflakes(MAX_REMINDER_MENTIONS + 3);

    const text = renderReminderMessage(
      reminder({ mentionUserIds: ids }),
      DATE_VALUE,
    );

    expect(mentionLine(text)).toBe(
      `参加: ${ids
        .slice(0, MAX_REMINDER_MENTIONS)
        .map((id) => `<@${id}>`)
        .join(" ")} ほか3名`,
    );
    // 切り詰めても本文は3行のまま(参加行が分割されない)。
    expect(text.split("\n")).toHaveLength(3);
  });

  it("本文に出すメンションは reminderMentionUserIds と同じ集合になる", () => {
    const target = reminder({ mentionUserIds: snowflakes(200) });

    const text = renderReminderMessage(target, DATE_VALUE);
    const mentioned = reminderMentionUserIds(target);

    for (const id of mentioned) {
      expect(text).toContain(`<@${id}>`);
    }
    expect(text.match(/<@\d+>/g) ?? []).toHaveLength(mentioned.length);
  });

  it("最長ケース(タイトル80文字・回答者200人)でも本文が2000文字以内に収まる", () => {
    const text = renderReminderMessage(
      reminder({
        // setMaxLength(80) の上限いっぱい
        guildSeq: 9999,
        title: "固".repeat(80),
        startMinute: 21 * 60 + 30,
        mentionUserIds: snowflakes(200),
      }),
      DATE_VALUE,
    );

    expect(text.length).toBeLessThanOrEqual(2000);
  });
});
