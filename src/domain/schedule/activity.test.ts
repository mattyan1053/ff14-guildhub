import { describe, expect, it } from "vitest";
import { decideDayStatus, PARTY_SIZE } from "./activity.js";
import type {
  CandidateSummary,
  OptionTally,
  StartTimeTally,
} from "./summary.js";

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
    minute % 60,
  ).padStart(2, "0")}`;
}

/** [startMinute, count] のリストから time 選択肢の集計と開始時刻表を作る。 */
function candSummary(opts: {
  times?: [number, number][];
  anytime?: number;
  maybe?: number;
  unavailable?: number;
}): CandidateSummary {
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
    candidate: { id: "c1", label: "7/25(土)", startsAt: null, position: 0 },
    optionTallies,
    startTimes,
    anytimeCount: opts.anytime ?? 0,
    maybeCount: opts.maybe ?? 0,
    unavailableCount: opts.unavailable ?? 0,
  };
}

describe("decideDayStatus", () => {
  it("時刻指定があれば全員が来られる最も遅い時刻を開始にする", () => {
    // 21:00 と 22:00 の指定 → 22:00 開始(21:00 の人も来られる)
    const status = decideDayStatus(
      candSummary({
        times: [
          [1260, 1],
          [1320, 1],
        ],
      }),
    );
    expect(status).toEqual({ kind: "active", startMinute: 1320 });
  });

  it("時刻指定が1種類ならその時刻を開始にする", () => {
    expect(decideDayStatus(candSummary({ times: [[1320, 2]] }))).toEqual({
      kind: "active",
      startMinute: 1320,
    });
  });

  it("いつでもと時刻指定が混在しても最も遅い指定時刻に合わせる", () => {
    const status = decideDayStatus(
      candSummary({ anytime: 3, times: [[1320, 1]] }),
    );
    expect(status).toEqual({ kind: "active", startMinute: 1320 });
  });

  it("誰かが不可なら休み(全員は参加できない)", () => {
    expect(
      decideDayStatus(candSummary({ times: [[1320, 2]], unavailable: 1 })),
    ).toEqual({ kind: "rest" });
  });

  it("不可はいないが未定がいるなら未定(連絡待ち)", () => {
    expect(decideDayStatus(candSummary({ anytime: 3, maybe: 1 }))).toEqual({
      kind: "pending",
    });
  });

  it("不可が優先。未定がいても不可がいれば休み", () => {
    expect(
      decideDayStatus(candSummary({ anytime: 3, maybe: 1, unavailable: 1 })),
    ).toEqual({ kind: "rest" });
  });

  it("全員いつでも(時刻指定なし)なら いつでも活動", () => {
    expect(decideDayStatus(candSummary({ anytime: 3 }))).toEqual({
      kind: "active-anytime",
    });
  });

  it("回答ゼロでもデフォルトで活動あり(いつでも)", () => {
    expect(decideDayStatus(candSummary({}))).toEqual({
      kind: "active-anytime",
    });
  });

  it("PARTY_SIZE は 8", () => {
    expect(PARTY_SIZE).toBe(8);
  });
});
