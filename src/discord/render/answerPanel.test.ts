import {
  type BaseMessageOptions,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { describe, expect, it } from "vitest";
import { startsAtFromDateValue } from "../../domain/schedule/datePresets.js";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import {
  ANSWER_APPLY_PREFIX,
  ANSWER_DAY_PREFIX,
  ANSWER_DONE_PREFIX,
  ANSWER_WEEK_PREFIX,
  parseAnswerPanel,
  parseApplyValue,
  renderAnswerPanel,
} from "./answerPanel.js";
import type { Draft, DraftKind } from "./answerPanelModel.js";

const OPTIONS: ResponseOption[] = [
  { id: "yes", label: "いつでも", kind: "yes", startMinute: null, position: 0 },
  { id: "t22", label: "22:00〜", kind: "time", startMinute: 1320, position: 1 },
  { id: "maybe", label: "未定", kind: "maybe", startMinute: null, position: 2 },
  { id: "no", label: "不可", kind: "no", startMinute: null, position: 3 },
];

function candidate(dateValue: string, position: number): Candidate {
  return {
    id: `c-${dateValue}`,
    label: dateValue,
    startsAt: startsAtFromDateValue(dateValue),
    position,
  };
}

function eventOf(dateValues: string[]): ScheduleEvent {
  return {
    id: "event-1",
    guildId: "g",
    channelId: "ch",
    messageId: null,
    creatorId: "creator",
    guildSeq: 7,
    title: "固定練習",
    description: null,
    status: "open",
    candidates: dateValues.map((v, i) => candidate(v, i)),
    responseOptions: OPTIONS,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function draftOf(entries: [string, DraftKind][]): Draft {
  return new Map<string, DraftKind>(entries);
}

function toJson(value: unknown): { [k: string]: unknown } {
  if (
    value &&
    typeof (value as { toJSON?: () => unknown }).toJSON === "function"
  ) {
    return (value as { toJSON: () => unknown }).toJSON() as {
      [k: string]: unknown;
    };
  }
  return (value ?? {}) as { [k: string]: unknown };
}

function firstEmbed(payload: BaseMessageOptions): {
  title?: string;
  fields?: { name: string; value: string }[];
} {
  return toJson(payload.embeds?.[0]);
}

function rows(payload: BaseMessageOptions): {
  components: {
    type: number;
    custom_id?: string;
    style?: number;
    label?: string;
    options?: unknown[];
  }[];
}[] {
  return (payload.components ?? []).map((r) => toJson(r) as never);
}

function allComponents(payload: BaseMessageOptions) {
  return rows(payload).flatMap((r) => r.components);
}

function dayButtons(payload: BaseMessageOptions) {
  return allComponents(payload).filter((c) =>
    (c.custom_id ?? "").startsWith(ANSWER_DAY_PREFIX),
  );
}

function dayValue(customId: string): string {
  return customId.slice(ANSWER_DAY_PREFIX.length).split(":")[1] ?? "";
}

describe("renderAnswerPanel", () => {
  const event = eventOf(["2026-07-25", "2026-07-26", "2026-08-02"]);

  it("タイトル・カレンダー・凡例・下書き明細フィールドを含む", () => {
    const draft = draftOf([
      ["2026-07-25", "attend"],
      ["2026-07-26", "no"],
      ["2026-08-02", "attend"],
    ]);
    const payload = renderAnswerPanel(event, draft, 0, []);
    const names = (firstEmbed(payload).fields ?? []).map((f) => f.name);
    expect(names.some((n) => n.startsWith("📅"))).toBe(true);
    expect(names.some((n) => n.includes("凡例"))).toBe(true);
    expect(names.some((n) => n.includes("下書き"))).toBe(true);
  });

  it("週ナビ・日ボタン・適用select・完了ボタンを持つ", () => {
    const payload = renderAnswerPanel(
      event,
      draftOf([["2026-07-25", "attend"]]),
      0,
      [],
    );
    const comps = allComponents(payload);
    const week = comps.find((c) =>
      (c.custom_id ?? "").startsWith(ANSWER_WEEK_PREFIX),
    );
    const applySelect = comps.find((c) =>
      (c.custom_id ?? "").startsWith(ANSWER_APPLY_PREFIX),
    );
    const done = comps.find((c) =>
      (c.custom_id ?? "").startsWith(ANSWER_DONE_PREFIX),
    );
    expect(week?.type).toBe(ComponentType.Button);
    expect(dayButtons(payload).length).toBeGreaterThan(0);
    expect(applySelect?.type).toBe(ComponentType.StringSelect);
    expect(done?.style).toBe(ButtonStyle.Success);
  });

  it("表示中の週の候補日だけを日ボタンにする", () => {
    // weekIndex 0 = 最初の週(2026-07-19〜, 25日を含む)。26日は次週、8/2 はさらに次週。
    const payload = renderAnswerPanel(
      event,
      draftOf([
        ["2026-07-25", "attend"],
        ["2026-07-26", "attend"],
        ["2026-08-02", "attend"],
      ]),
      0,
      [],
    );
    expect(dayButtons(payload).map((b) => dayValue(b.custom_id ?? ""))).toEqual(
      ["2026-07-25"],
    );
  });

  it("次週(weekIndex 1)は次の週の候補日を出す", () => {
    const payload = renderAnswerPanel(
      event,
      draftOf([
        ["2026-07-25", "attend"],
        ["2026-07-26", "attend"],
        ["2026-08-02", "attend"],
      ]),
      1,
      [],
    );
    expect(dayButtons(payload).map((b) => dayValue(b.custom_id ?? ""))).toEqual(
      ["2026-07-26"],
    );
  });

  it("日ボタンのラベルは下書き種別の記号を含む", () => {
    const week = eventOf(["2026-07-26", "2026-07-27"]); // 同じ週
    const payload = renderAnswerPanel(
      week,
      draftOf([
        ["2026-07-26", "no"],
        ["2026-07-27", { startMinute: 1320 }],
      ]),
      0,
      [],
    );
    const labels = dayButtons(payload).map((b) => b.label ?? "");
    expect(labels.some((l) => l.startsWith("✕"))).toBe(true);
    expect(labels.some((l) => l.includes("🕒22:00"))).toBe(true);
  });

  it("適用selectは 参加可に戻す/時刻/未定/不可 を持つ", () => {
    const payload = renderAnswerPanel(
      event,
      draftOf([["2026-07-25", "attend"]]),
      0,
      [],
    );
    const applySelect = allComponents(payload).find((c) =>
      (c.custom_id ?? "").startsWith(ANSWER_APPLY_PREFIX),
    );
    const values = ((applySelect?.options ?? []) as { value: string }[]).map(
      (o) => o.value,
    );
    expect(values).toEqual(["attend", "t1320", "maybe", "no"]);
  });

  it("選択中の日ボタンは Primary(色付き)になる", () => {
    const week = eventOf(["2026-07-26", "2026-07-27"]); // 同じ週
    const payload = renderAnswerPanel(
      week,
      draftOf([
        ["2026-07-26", "attend"],
        ["2026-07-27", "attend"],
      ]),
      0,
      ["2026-07-27"],
    );
    const buttons = dayButtons(payload);
    const b26 = buttons.find(
      (b) => dayValue(b.custom_id ?? "") === "2026-07-26",
    );
    const b27 = buttons.find(
      (b) => dayValue(b.custom_id ?? "") === "2026-07-27",
    );
    expect(b27?.style).toBe(ButtonStyle.Primary);
    expect(b26?.style).toBe(ButtonStyle.Secondary);
  });
});

describe("parseApplyValue", () => {
  it("attend/maybe/no と t<分> を DraftKind に写す", () => {
    expect(parseApplyValue("attend")).toBe("attend");
    expect(parseApplyValue("maybe")).toBe("maybe");
    expect(parseApplyValue("no")).toBe("no");
    expect(parseApplyValue("t1320")).toEqual({ startMinute: 1320 });
    expect(parseApplyValue("bogus")).toBeNull();
  });
});

describe("renderAnswerPanel → parseAnswerPanel 往復", () => {
  it("下書き(例外)・週・選択日(Primaryボタン)を復元できる", () => {
    const event = eventOf(["2026-07-26", "2026-07-27", "2026-07-28"]); // 同週
    const draft = draftOf([
      ["2026-07-26", "no"],
      ["2026-07-27", { startMinute: 1320 }],
      ["2026-07-28", "attend"],
    ]);
    const payload = renderAnswerPanel(event, draft, 0, ["2026-07-28"]);
    const parsed = parseAnswerPanel(payload, event);

    expect(parsed.draft.get("2026-07-26")).toBe("no");
    expect(parsed.draft.get("2026-07-27")).toEqual({ startMinute: 1320 });
    expect(parsed.draft.get("2026-07-28")).toBe("attend");
    expect(parsed.weekIndex).toBe(0);
    expect(parsed.selectedDates).toEqual(["2026-07-28"]);
  });

  it("次週のインデックスを復元できる", () => {
    const event = eventOf(["2026-07-25", "2026-08-02"]); // 別週×2
    const payload = renderAnswerPanel(
      event,
      draftOf([
        ["2026-07-25", "attend"],
        ["2026-08-02", "attend"],
      ]),
      1,
      [],
    );
    expect(parseAnswerPanel(payload, event).weekIndex).toBe(1);
  });

  it("凡例の『不可』『未定』の文字を下書きとして誤読しない", () => {
    const event = eventOf(["2026-07-26"]);
    const payload = renderAnswerPanel(
      event,
      draftOf([["2026-07-26", "attend"]]),
      0,
      [],
    );
    const parsed = parseAnswerPanel(payload, event);
    // 例外ゼロ。凡例に不可/未定の語はあるが日付が紐づかないので draft は全て attend
    expect(parsed.draft.get("2026-07-26")).toBe("attend");
  });
});
