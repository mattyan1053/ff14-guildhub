import { describe, expect, it } from "vitest";
import { ScheduleValidationError } from "./errors.js";
import {
  buildResponseOptionSpecs,
  LABEL_ANYTIME,
  LABEL_UNAVAILABLE,
  LABEL_UNDECIDED,
  MAX_TIME_SLOTS,
  normalizeCandidateLabels,
  parseTimeSlots,
  type TimeSlot,
} from "./validation.js";

describe("normalizeCandidateLabels", () => {
  it("各行をトリムする", () => {
    expect(normalizeCandidateLabels(["  7/25  ", " 7/26"])).toEqual([
      "7/25",
      "7/26",
    ]);
  });

  it("空行・空白のみの行を除去する", () => {
    expect(normalizeCandidateLabels(["7/25", "", "   ", "7/26"])).toEqual([
      "7/25",
      "7/26",
    ]);
  });

  it("重複を順序維持で除去する", () => {
    expect(normalizeCandidateLabels(["7/25", "7/26", "7/25"])).toEqual([
      "7/25",
      "7/26",
    ]);
  });

  it("0件や超過はここでは投げずそのまま返す", () => {
    expect(normalizeCandidateLabels([])).toEqual([]);
  });
});

describe("parseTimeSlots", () => {
  it("HH:MM を分に変換する", () => {
    expect(parseTimeSlots(["21:00"])).toEqual([
      { label: "21:00〜", startMinute: 1260 },
    ]);
  });

  it("H:MM も受理しラベルをゼロ埋め正規化する", () => {
    expect(parseTimeSlots(["9:30"])).toEqual([
      { label: "09:30〜", startMinute: 570 },
    ]);
  });

  it("末尾の 〜 を許容する", () => {
    expect(parseTimeSlots(["21:00〜"])).toEqual([
      { label: "21:00〜", startMinute: 1260 },
    ]);
  });

  it("末尾の - を許容する", () => {
    expect(parseTimeSlots(["21:00-"])).toEqual([
      { label: "21:00〜", startMinute: 1260 },
    ]);
  });

  it("前後の空白を許容する", () => {
    expect(parseTimeSlots(["  21:00  "])).toEqual([
      { label: "21:00〜", startMinute: 1260 },
    ]);
  });

  it("空行・空白のみの行は無視する", () => {
    expect(parseTimeSlots(["21:00", "", "  "])).toEqual([
      { label: "21:00〜", startMinute: 1260 },
    ]);
  });

  it("昇順にソートして返す", () => {
    expect(parseTimeSlots(["22:00", "21:00"])).toEqual([
      { label: "21:00〜", startMinute: 1260 },
      { label: "22:00〜", startMinute: 1320 },
    ]);
  });

  it("0:00 と 23:59 は境界として受理する", () => {
    expect(parseTimeSlots(["0:00", "23:59"])).toEqual([
      { label: "00:00〜", startMinute: 0 },
      { label: "23:59〜", startMinute: 1439 },
    ]);
  });

  it("24:00 は範囲外でエラー", () => {
    expect(() => parseTimeSlots(["24:00"])).toThrow(ScheduleValidationError);
  });

  it("分が60以上(25:70)はエラー", () => {
    expect(() => parseTimeSlots(["25:70"])).toThrow(ScheduleValidationError);
  });

  it("非数値の行はエラー", () => {
    expect(() => parseTimeSlots(["よる9時"])).toThrow(ScheduleValidationError);
  });

  it("重複した時刻はエラー", () => {
    expect(() => parseTimeSlots(["21:00", "21:00"])).toThrow(
      ScheduleValidationError,
    );
  });

  it("MAX_TIME_SLOTS を超えるとエラー", () => {
    const lines = Array.from(
      { length: MAX_TIME_SLOTS + 1 },
      (_, i) => `${i}:00`,
    );

    expect(() => parseTimeSlots(lines)).toThrow(ScheduleValidationError);
  });

  it("時刻0件なら空配列を返す", () => {
    expect(parseTimeSlots([])).toEqual([]);
  });
});

describe("buildResponseOptionSpecs", () => {
  it("時刻0件なら いつでも/未定/不可 の3件を返す", () => {
    expect(buildResponseOptionSpecs([])).toEqual([
      { label: LABEL_ANYTIME, kind: "yes", startMinute: null },
      { label: LABEL_UNDECIDED, kind: "maybe", startMinute: null },
      { label: LABEL_UNAVAILABLE, kind: "no", startMinute: null },
    ]);
  });

  it("[いつでも] + [時刻(昇順)] + [未定] + [不可] の順で組み立てる", () => {
    const slots: TimeSlot[] = [
      { label: "21:00〜", startMinute: 1260 },
      { label: "22:00〜", startMinute: 1320 },
    ];

    expect(buildResponseOptionSpecs(slots)).toEqual([
      { label: LABEL_ANYTIME, kind: "yes", startMinute: null },
      { label: "21:00〜", kind: "time", startMinute: 1260 },
      { label: "22:00〜", kind: "time", startMinute: 1320 },
      { label: LABEL_UNDECIDED, kind: "maybe", startMinute: null },
      { label: LABEL_UNAVAILABLE, kind: "no", startMinute: null },
    ]);
  });
});
