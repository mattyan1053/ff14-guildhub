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
