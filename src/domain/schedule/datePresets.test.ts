import { describe, expect, it } from "vitest";
import {
  type DatePreset,
  datesBetween,
  formatDateLabel,
  startsAtFromDateValue,
  weekWindow,
} from "./datePresets.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 連続する暦日か(隣接する startsAt の差が常に1日)を検証する。 */
function isConsecutive(presets: readonly DatePreset[]): boolean {
  for (let i = 1; i < presets.length; i += 1) {
    const prev = presets[i - 1] as DatePreset;
    const curr = presets[i] as DatePreset;
    if (curr.startsAt.getTime() - prev.startsAt.getTime() !== DAY_MS) {
      return false;
    }
  }
  return true;
}

/**
 * 形式(4-2-2のゼロ埋め)は満たすが暦日として実在しない入力。
 * Date.UTC は範囲外の月日を黙って繰り上げるため、別の実在日として通ってはならない。
 */
const NON_EXISTENT_CALENDAR_DATES = [
  "2026-02-31", // 繰り上げると 2026-03-03
  "2026-02-30", // 繰り上げると 2026-03-02
  "2026-13-01", // 繰り上げると 2027-01-01
  "2026-00-01", // 繰り下げると 2025-12-01
  "2026-01-32", // 繰り上げると 2026-02-01
  "2026-01-00", // 繰り下げると 2025-12-31
  "2026-04-31", // 4月は30日まで
  "2026-06-31", // 6月は30日まで
  "2026-09-31", // 9月は30日まで
  "2026-11-31", // 11月は30日まで
  "2026-99-99",
] as const;

describe("weekWindow", () => {
  it("offset=0 は今日(JST)起点の7日を昇順で返す(today..+6)", () => {
    // now = JST 2026-07-22 00:00
    const now = new Date("2026-07-21T15:00:00.000Z");

    const presets = weekWindow(now, 0);

    expect(presets).toHaveLength(7);
    expect(presets.map((p) => p.value)).toEqual([
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]);
    expect(presets.map((p) => p.label)).toEqual([
      "7/22(水)",
      "7/23(木)",
      "7/24(金)",
      "7/25(土)",
      "7/26(日)",
      "7/27(月)",
      "7/28(火)",
    ]);
    expect(isConsecutive(presets)).toBe(true);
  });

  it("offset=1 は today+7 起点の7日(7/29..8/4、月またぎ連続)", () => {
    const now = new Date("2026-07-21T15:00:00.000Z"); // JST 7/22

    const presets = weekWindow(now, 1);

    expect(presets).toHaveLength(7);
    expect(presets.map((p) => p.value)).toEqual([
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
    expect(presets.map((p) => p.label)).toEqual([
      "7/29(水)",
      "7/30(木)",
      "7/31(金)",
      "8/1(土)",
      "8/2(日)",
      "8/3(月)",
      "8/4(火)",
    ]);
    expect(isConsecutive(presets)).toBe(true);
  });

  it("offset=2 は today+14 起点(8/5 始まり)の7日", () => {
    const now = new Date("2026-07-21T15:00:00.000Z"); // JST 7/22

    const presets = weekWindow(now, 2);

    expect(presets).toHaveLength(7);
    expect(presets[0]?.value).toBe("2026-08-05");
    expect(presets[0]?.label).toBe("8/5(水)");
    expect(isConsecutive(presets)).toBe(true);
  });

  it("JST境界: 15:00Zちょうど(JST翌日00:00)は翌日の暦日を先頭にする", () => {
    const now = new Date("2026-07-21T15:00:00.000Z"); // JST 7/22 00:00

    const first = weekWindow(now, 0)[0];

    expect(first?.value).toBe("2026-07-22");
    expect(first?.label).toBe("7/22(水)");
  });

  it("JST境界: 14:59Z(JST当日23:59)はまだ当日の暦日を先頭にする", () => {
    const now = new Date("2026-07-21T14:59:00.000Z"); // JST 7/21 23:59

    const first = weekWindow(now, 0)[0];

    expect(first?.value).toBe("2026-07-21");
    expect(first?.label).toBe("7/21(火)");
  });

  it("年をまたいでも連続する(JST 12/29 起点の末尾は 2027-01-04)", () => {
    const now = new Date("2026-12-28T15:00:00.000Z"); // JST 12/29 00:00

    const presets = weekWindow(now, 0);

    expect(presets[0]?.value).toBe("2026-12-29");
    expect(presets[6]?.value).toBe("2027-01-04");
    expect(presets[6]?.label).toBe("1/4(月)");
    expect(isConsecutive(presets)).toBe(true);
  });

  it("各 preset の startsAt は startsAtFromDateValue(value) と一致する(往復)", () => {
    const now = new Date("2026-07-21T15:00:00.000Z");

    for (const offset of [0, 1, 2]) {
      for (const preset of weekWindow(now, offset)) {
        const roundTrip = startsAtFromDateValue(preset.value);
        expect(roundTrip).not.toBeNull();
        expect((roundTrip as Date).getTime()).toBe(preset.startsAt.getTime());
      }
    }
  });

  it("各 preset の label は formatDateLabel(value) と一致する", () => {
    const now = new Date("2026-07-21T15:00:00.000Z");

    for (const preset of weekWindow(now, 1)) {
      expect(formatDateLabel(preset.value)).toBe(preset.label);
    }
  });
});

describe("datesBetween", () => {
  it("両端を含む全日を昇順で返す", () => {
    expect(datesBetween("2026-07-22", "2026-07-25")).toEqual([
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]);
  });

  it("逆順で渡しても昇順に整える", () => {
    expect(datesBetween("2026-07-25", "2026-07-22")).toEqual([
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]);
  });

  it("開始=終了なら1件", () => {
    expect(datesBetween("2026-07-22", "2026-07-22")).toEqual(["2026-07-22"]);
  });

  it("月をまたいでも連続する", () => {
    expect(datesBetween("2026-07-30", "2026-08-02")).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  it("形式不一致は空配列", () => {
    expect(datesBetween("2026/07/22", "2026-07-25")).toEqual([]);
    expect(datesBetween("", "2026-07-25")).toEqual([]);
  });

  it("始端が実在しない暦日なら空配列(繰り上げた日から数え始めない)", () => {
    expect(datesBetween("2026-02-31", "2026-03-05")).toEqual([]);
    expect(datesBetween("2026-13-01", "2027-01-03")).toEqual([]);
    expect(datesBetween("2026-01-00", "2026-01-03")).toEqual([]);
  });

  it("終端が実在しない暦日なら空配列", () => {
    expect(datesBetween("2026-02-25", "2026-02-31")).toEqual([]);
    expect(datesBetween("2026-01-01", "2026-00-05")).toEqual([]);
    expect(datesBetween("2026-01-01", "2026-01-32")).toEqual([]);
  });

  it("両端が実在しない暦日なら空配列", () => {
    expect(datesBetween("2026-02-30", "2026-04-31")).toEqual([]);
  });

  it("不変条件: 返す値はすべて実在する暦日(startsAtFromDateValue が null にならない)", () => {
    const values = datesBetween("2026-02-25", "2026-03-03");

    expect(values).toEqual([
      "2026-02-25",
      "2026-02-26",
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
    for (const value of values) {
      expect(startsAtFromDateValue(value)).not.toBeNull();
    }
  });

  it("うるう年の2/29を含む範囲は2/29を返す(2028年)", () => {
    expect(datesBetween("2028-02-28", "2028-03-01")).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });
});

describe("formatDateLabel", () => {
  it("YYYY-MM-DD を M/D(曜) に整形する", () => {
    expect(formatDateLabel("2026-07-22")).toBe("7/22(水)");
    expect(formatDateLabel("2026-08-03")).toBe("8/3(月)");
  });

  it("ゼロ埋めは月日から外す(8/1 であって 08/01 でない)", () => {
    expect(formatDateLabel("2026-08-01")).toBe("8/1(土)");
  });

  it("スラッシュ区切り・整形済みラベル・空文字は null", () => {
    expect(formatDateLabel("2026/07/22")).toBeNull();
    expect(formatDateLabel("7/22(水)")).toBeNull();
    expect(formatDateLabel("")).toBeNull();
  });

  it.each(NON_EXISTENT_CALENDAR_DATES)(
    "実在しない暦日 %s は null(別の実在日のラベルにしない)",
    (value) => {
      expect(formatDateLabel(value)).toBeNull();
    },
  );

  it("うるう年でない年の2/29は null、うるう年の2/29はラベルを返す", () => {
    expect(formatDateLabel("2026-02-29")).toBeNull();
    expect(formatDateLabel("2027-02-29")).toBeNull();
    expect(formatDateLabel("2100-02-29")).toBeNull(); // 100年ルールでうるう年ではない
    expect(formatDateLabel("2028-02-29")).toBe("2/29(火)");
    expect(formatDateLabel("2000-02-29")).toBe("2/29(火)"); // 400年ルールでうるう年
  });

  it("月末の境界は実在する日まで受理する(1月31日・4月30日)", () => {
    expect(formatDateLabel("2026-01-31")).toBe("1/31(土)");
    expect(formatDateLabel("2026-04-30")).toBe("4/30(木)");
  });

  it("不変条件: startsAtFromDateValue が null を返す入力では null を返す", () => {
    for (const value of NON_EXISTENT_CALENDAR_DATES) {
      expect(startsAtFromDateValue(value)).toBeNull();
      expect(formatDateLabel(value)).toBeNull();
    }
  });
});

describe("startsAtFromDateValue", () => {
  it("YYYY-MM-DD を 00:00 JST の UTC Date に変換する", () => {
    const startsAt = startsAtFromDateValue("2026-07-22");

    expect(startsAt?.toISOString()).toBe("2026-07-21T15:00:00.000Z");
  });

  it("曜日ラベル付きの表示文字列は形式不一致で null", () => {
    expect(startsAtFromDateValue("7/22(火)")).toBeNull();
  });

  it("スラッシュ区切りなど形式不一致は null", () => {
    expect(startsAtFromDateValue("2026/07/22")).toBeNull();
    expect(startsAtFromDateValue("2026-7-22")).toBeNull();
    expect(startsAtFromDateValue("")).toBeNull();
  });

  it.each(NON_EXISTENT_CALENDAR_DATES)(
    "実在しない暦日 %s は null(繰り上げ正規化して別の日として受理しない)",
    (value) => {
      expect(startsAtFromDateValue(value)).toBeNull();
    },
  );

  it("うるう年でない年の2/29は null", () => {
    expect(startsAtFromDateValue("2026-02-29")).toBeNull();
    expect(startsAtFromDateValue("2027-02-29")).toBeNull();
    expect(startsAtFromDateValue("2100-02-29")).toBeNull(); // 100年ルールでうるう年ではない
  });

  it("うるう年の2/29は 00:00 JST の UTC Date を返す", () => {
    expect(startsAtFromDateValue("2028-02-29")?.toISOString()).toBe(
      "2028-02-28T15:00:00.000Z",
    );
    expect(startsAtFromDateValue("2024-02-29")?.toISOString()).toBe(
      "2024-02-28T15:00:00.000Z",
    );
    expect(startsAtFromDateValue("2000-02-29")?.toISOString()).toBe(
      "2000-02-28T15:00:00.000Z",
    );
  });

  it("月末の境界は実在する日まで受理する(31日月の31日・平年の2/28)", () => {
    expect(startsAtFromDateValue("2026-01-31")?.toISOString()).toBe(
      "2026-01-30T15:00:00.000Z",
    );
    expect(startsAtFromDateValue("2026-12-31")?.toISOString()).toBe(
      "2026-12-30T15:00:00.000Z",
    );
    expect(startsAtFromDateValue("2026-02-28")?.toISOString()).toBe(
      "2026-02-27T15:00:00.000Z",
    );
  });

  it("不変条件: 受理した値は value に往復する", () => {
    for (const value of [
      "2026-01-01",
      "2026-02-28",
      "2028-02-29",
      "2026-07-22",
      "2026-12-31",
    ]) {
      const startsAt = startsAtFromDateValue(value);

      expect(startsAt).not.toBeNull();
      expect(datesBetween(value, value)).toEqual([value]);
    }
  });

  it("2桁相当の年(0099)は 1999 に読み替えず null", () => {
    expect(startsAtFromDateValue("0099-01-01")).toBeNull();
    expect(formatDateLabel("0099-01-01")).toBeNull();
  });

  it("weekWindow の value を渡すと その preset.startsAt に一致する", () => {
    const preset: DatePreset | undefined = weekWindow(
      new Date("2026-07-21T15:00:00.000Z"),
      0,
    )[0];

    expect(preset).toBeDefined();
    expect(startsAtFromDateValue((preset as DatePreset).value)?.getTime()).toBe(
      (preset as DatePreset).startsAt.getTime(),
    );
  });
});
