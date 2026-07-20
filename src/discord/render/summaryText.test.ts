import { describe, expect, it } from "vitest";
import type { Candidate } from "../../domain/schedule/scheduleEvent.js";
import type {
  CandidateSummary,
  ScheduleSummary,
} from "../../domain/schedule/summary.js";
import {
  formatCandidateLine,
  formatEventHeading,
  formatSummaryLines,
} from "./summaryText.js";

function candidate(id: string, label: string, position: number): Candidate {
  return { id, label, startsAt: null, position };
}

describe("formatEventHeading", () => {
  it("絵文字とタイトルと連番を半角スペース2つで区切る", () => {
    expect(formatEventHeading({ title: "固定練習", guildSeq: 3 })).toBe(
      "📅 固定練習  #3",
    );
  });
});

describe("formatCandidateLine", () => {
  it("開始時刻があるときは時刻別人数を半角スペース2つで並べる", () => {
    const summary: CandidateSummary = {
      candidate: candidate("c1", "7/25(金)", 0),
      optionTallies: [],
      startTimes: [
        {
          responseOptionId: "o21",
          label: "21:00〜",
          startMinute: 1260,
          attendableCount: 4,
        },
        {
          responseOptionId: "o22",
          label: "22:00〜",
          startMinute: 1320,
          attendableCount: 6,
        },
      ],
      anytimeCount: 0,
      maybeCount: 1,
      unavailableCount: 2,
    };

    expect(formatCandidateLine(summary)).toBe(
      "7/25(金): 21:00〜4人  22:00〜6人 / 未定1 不可2",
    );
  });

  it("開始時刻が空のときはいつでも人数を表示する", () => {
    const summary: CandidateSummary = {
      candidate: candidate("c2", "7/26(土)", 1),
      optionTallies: [],
      startTimes: [],
      anytimeCount: 7,
      maybeCount: 0,
      unavailableCount: 1,
    };

    expect(formatCandidateLine(summary)).toBe(
      "7/26(土): いつでも7人 / 未定0 不可1",
    );
  });
});

describe("formatSummaryLines", () => {
  it("各候補を1行ずつ整形する", () => {
    const c1: CandidateSummary = {
      candidate: candidate("c1", "7/25(金)", 0),
      optionTallies: [],
      startTimes: [
        {
          responseOptionId: "o21",
          label: "21:00〜",
          startMinute: 1260,
          attendableCount: 4,
        },
      ],
      anytimeCount: 0,
      maybeCount: 1,
      unavailableCount: 2,
    };
    const c2: CandidateSummary = {
      candidate: candidate("c2", "7/26(土)", 1),
      optionTallies: [],
      startTimes: [],
      anytimeCount: 7,
      maybeCount: 0,
      unavailableCount: 1,
    };
    const summary = {
      event: { title: "固定練習", guildSeq: 3 },
      candidates: [c1, c2],
    } as unknown as ScheduleSummary;

    expect(formatSummaryLines(summary)).toEqual([
      "7/25(金): 21:00〜4人 / 未定1 不可2",
      "7/26(土): いつでも7人 / 未定0 不可1",
    ]);
  });
});
