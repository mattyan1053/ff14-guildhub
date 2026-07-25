import { describe, expect, it } from "vitest";
import { startsAtFromDateValue } from "../../domain/schedule/datePresets.js";
import type { Candidate } from "../../domain/schedule/scheduleEvent.js";
import type {
  CandidateSummary,
  OptionTally,
  ScheduleSummary,
  StartTimeTally,
} from "../../domain/schedule/summary.js";
import {
  buildActivityCalendarFields,
  buildLegendField,
  formatNextActivityLine,
  formatTodayLine,
  hasDatedCandidates,
} from "./summaryCalendar.js";

const ESC = String.fromCharCode(27);

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
    minute % 60,
  ).padStart(2, "0")}`;
}

function candidate(dateValue: string | null, position: number): Candidate {
  return {
    id: `c-${dateValue ?? "none"}-${position}`,
    label: dateValue ?? "カスタム",
    startsAt: dateValue ? startsAtFromDateValue(dateValue) : null,
    position,
  };
}

/** 候補日を活動判定の入力どおりに組み立てる(times=[startMinute, count])。 */
function day(
  dateValue: string | null,
  position: number,
  opts: {
    times?: [number, number][];
    anytime?: number;
    maybe?: number;
    unavailable?: number;
  } = {},
): CandidateSummary {
  const times = opts.times ?? [];
  const optionTallies: OptionTally[] = times.map(([minute, count]) => ({
    responseOptionId: `o-${minute}`,
    label: hhmm(minute),
    kind: "time",
    count,
    respondentIds: Array.from({ length: count }, (_, i) => `u-${minute}-${i}`),
  }));
  const startTimes: StartTimeTally[] = times.map(([minute, count]) => ({
    responseOptionId: `o-${minute}`,
    label: hhmm(minute),
    startMinute: minute,
    attendableCount: count,
  }));
  return {
    candidate: candidate(dateValue, position),
    optionTallies,
    startTimes,
    anytimeCount: opts.anytime ?? 0,
    maybeCount: opts.maybe ?? 0,
    unavailableCount: opts.unavailable ?? 0,
  };
}

function summaryOf(candidates: CandidateSummary[]): ScheduleSummary {
  return {
    event: { title: "固定練習", guildSeq: 3 } as ScheduleSummary["event"],
    candidates,
  };
}

// 22:00 = 1320 分、21:00 = 1260 分。
const active22 = (dateValue: string, position: number) =>
  day(dateValue, position, { times: [[1320, 1]] });
const rest = (dateValue: string, position: number) =>
  day(dateValue, position, { unavailable: 1 });
// 不可はいないが未定がいる = 連絡待ち。
const pending = (dateValue: string, position: number) =>
  day(dateValue, position, { anytime: 2, maybe: 1 });

describe("buildActivityCalendarFields", () => {
  it("月ごとに ansi カレンダーのフィールドを昇順で作る", () => {
    const fields = buildActivityCalendarFields(
      summaryOf([active22("2026-07-25", 0), active22("2026-08-01", 1)]),
    );
    expect(fields.map((f) => f.name)).toEqual(["📅 2026-07", "📅 2026-08"]);
    for (const field of fields) {
      expect(field.value).toContain("```ansi");
    }
  });

  it("活動日は開始時刻の色、未定は黄、休みは休み色で塗る", () => {
    const fields = buildActivityCalendarFields(
      summaryOf([
        active22("2026-07-25", 0),
        rest("2026-07-26", 1),
        pending("2026-07-27", 2),
      ]),
    );
    const value = fields[0]?.value ?? "";
    // 25日は 22:00(唯一の時刻=パレット先頭=緑 42)、26日は休み(黒 40)、27日は未定(黄 43)
    expect(value).toContain(`${ESC}[1;37;42m 25 ${ESC}[0m`);
    expect(value).toContain(`${ESC}[0;37;40m 26 ${ESC}[0m`);
    expect(value).toContain(`${ESC}[1;30;43m 27 ${ESC}[0m`);
  });

  it("日付を持たない候補だけならカレンダーは空", () => {
    const fields = buildActivityCalendarFields(
      summaryOf([day(null, 0, { anytime: 8 })]),
    );
    expect(fields).toEqual([]);
  });
});

describe("buildLegendField", () => {
  it("実際に使われている開始時刻と休みを凡例に並べる", () => {
    const legend = buildLegendField(
      summaryOf([
        active22("2026-07-25", 0),
        day("2026-07-26", 1, { times: [[1260, 1]] }), // 21:00
        rest("2026-07-27", 2),
      ]),
    );
    expect(legend.value).toContain("21:00開始");
    expect(legend.value).toContain("22:00開始");
    expect(legend.value).toContain("活動なし(休み)");
  });

  it("時刻なし(いつでも)の活動があるときは いつでも を出す", () => {
    const legend = buildLegendField(
      summaryOf([day("2026-07-25", 0, { anytime: 8 })]),
    );
    expect(legend.value).toContain("いつでも");
    expect(legend.value).toContain("活動なし(休み)");
  });

  it("未定の日があるときは 未定(連絡待ち) を凡例に出す", () => {
    const legend = buildLegendField(
      summaryOf([active22("2026-07-25", 0), pending("2026-07-26", 1)]),
    );
    expect(legend.value).toContain("未定(連絡待ち)");
  });
});

describe("formatTodayLine", () => {
  const now = new Date("2026-07-25T02:00:00.000Z"); // JST 7/25 11:00

  it("今日が活動日なら開始時刻つきで活動ありを出す", () => {
    const line = formatTodayLine(summaryOf([active22("2026-07-25", 0)]), now);
    expect(line).toContain("活動日");
    expect(line).toContain("22:00スタート");
  });

  it("今日が休み(誰か不可)なら活動なしを出す", () => {
    const line = formatTodayLine(summaryOf([rest("2026-07-25", 0)]), now);
    expect(line).toContain("活動なし");
  });

  it("今日が未定なら連絡待ちを出す", () => {
    const line = formatTodayLine(summaryOf([pending("2026-07-25", 0)]), now);
    expect(line).toContain("未定(連絡待ち)");
  });

  it("今日が候補にない日でも活動なしを出す", () => {
    const line = formatTodayLine(summaryOf([active22("2026-07-30", 0)]), now);
    expect(line).toContain("活動なし");
  });
});

describe("formatNextActivityLine", () => {
  const now = new Date("2026-07-25T02:00:00.000Z"); // JST 7/25

  it("明日以降で最も近い活動日を出す(休みは飛ばす)", () => {
    const line = formatNextActivityLine(
      summaryOf([
        rest("2026-07-26", 0),
        active22("2026-07-28", 1),
        active22("2026-08-02", 2),
      ]),
      now,
    );
    expect(line).toContain("7/28(火)");
    expect(line).toContain("22:00スタート");
  });

  it("今日は次回に含めない", () => {
    const line = formatNextActivityLine(
      summaryOf([active22("2026-07-25", 0)]),
      now,
    );
    expect(line).toContain("予定なし");
  });

  it("これから休み以外の日が無ければ予定なし", () => {
    const line = formatNextActivityLine(
      summaryOf([rest("2026-07-28", 0)]),
      now,
    );
    expect(line).toContain("予定なし");
  });

  it("未定の日も次回に含め、連絡待ちとして出す", () => {
    const line = formatNextActivityLine(
      summaryOf([pending("2026-07-27", 0), active22("2026-07-29", 1)]),
      now,
    );
    // 7/27(月) の未定が最も近い → 連絡待ちで出す
    expect(line).toContain("7/27(月)");
    expect(line).toContain("未定(連絡待ち)");
  });
});

describe("hasDatedCandidates", () => {
  it("日付つき候補があれば true", () => {
    expect(hasDatedCandidates(summaryOf([active22("2026-07-25", 0)]))).toBe(
      true,
    );
  });
  it("日付なしだけなら false", () => {
    expect(hasDatedCandidates(summaryOf([day(null, 0, { anytime: 8 })]))).toBe(
      false,
    );
  });
});
