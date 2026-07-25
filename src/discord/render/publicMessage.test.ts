import { type BaseMessageOptions, ComponentType } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  formatDateLabel,
  startsAtFromDateValue,
} from "../../domain/schedule/datePresets.js";
import type { Candidate } from "../../domain/schedule/scheduleEvent.js";
import type {
  CandidateSummary,
  OptionTally,
  ScheduleSummary,
  StartTimeTally,
} from "../../domain/schedule/summary.js";
import { encodePanel } from "../customId.js";
import { renderPublicMessage } from "./publicMessage.js";

function candidate(dateValue: string, position: number): Candidate {
  return {
    id: `c-${position}`,
    label: formatDateLabel(dateValue) ?? dateValue,
    startsAt: startsAtFromDateValue(dateValue),
    position,
  };
}

function timeTally(
  startMinute: number,
  attendableCount: number,
): StartTimeTally {
  return {
    responseOptionId: `o-${startMinute}`,
    label: `${Math.floor(startMinute / 60)}:00〜`,
    startMinute,
    attendableCount,
  };
}

function candSummary(
  dateValue: string,
  position: number,
  opts: {
    startTimes?: StartTimeTally[];
    anytimeCount?: number;
    optionTallies?: OptionTally[];
  } = {},
): CandidateSummary {
  return {
    candidate: candidate(dateValue, position),
    optionTallies: opts.optionTallies ?? [],
    startTimes: opts.startTimes ?? [],
    anytimeCount: opts.anytimeCount ?? 0,
    maybeCount: 0,
    unavailableCount: 0,
  };
}

function summaryOf(
  candidates: CandidateSummary[],
  event: Partial<ScheduleSummary["event"]> = {},
): ScheduleSummary {
  return {
    event: {
      id: "evt-1",
      title: "固定練習",
      guildSeq: 3,
      description: null,
      ...event,
    } as ScheduleSummary["event"],
    candidates,
  };
}

function toJson(value: unknown): { [key: string]: unknown } {
  if (
    value &&
    typeof (value as { toJSON?: () => unknown }).toJSON === "function"
  ) {
    return (value as { toJSON: () => unknown }).toJSON() as {
      [key: string]: unknown;
    };
  }
  return (value ?? {}) as { [key: string]: unknown };
}

function firstEmbed(payload: BaseMessageOptions): {
  title?: string;
  description?: string;
  fields?: { name: string; value: string }[];
} {
  return toJson(payload.embeds?.[0]);
}

function fieldNames(payload: BaseMessageOptions): string[] {
  return (firstEmbed(payload).fields ?? []).map((f) => f.name);
}

const NOW = new Date("2026-07-25T02:00:00.000Z"); // JST 2026-07-25 11:00
// 22:00 を1人が指定した活動日(誰も不可でないので活動あり・22:00開始)。
const active22 = (dateValue: string, position: number) =>
  candSummary(dateValue, position, {
    startTimes: [timeTally(1320, 1)],
    optionTallies: [
      {
        responseOptionId: "o-1320",
        label: "22:00〜",
        kind: "time",
        count: 1,
        respondentIds: [`u-${dateValue}`],
      },
    ],
  });
// 回答ゼロの活動日(デフォルト活動あり=いつでも)。回答済み0人の確認用。
const emptyDay = (dateValue: string, position: number) =>
  candSummary(dateValue, position, {});

describe("renderPublicMessage", () => {
  it("見出し・カレンダー・凡例・回答済みフィールドと回答ボタンを含む", () => {
    const payload = renderPublicMessage(
      summaryOf([active22("2026-07-25", 0), active22("2026-07-26", 1)]),
      NOW,
    );

    expect(firstEmbed(payload).title).toBe("📅 固定練習  #3");
    const names = fieldNames(payload);
    expect(names).toContain("📅 2026-07");
    expect(names).toContain("凡例(背景色=活動の開始時刻)");
    expect(names.some((n) => n.startsWith("回答済み"))).toBe(true);
    // 候補ごとの縦長リストは出さない
    expect(names).not.toContain("候補ごとの回答");

    const row = toJson(payload.components?.[0]) as {
      components: { type: number; custom_id?: string }[];
    };
    const first = row.components[0];
    expect(first?.type).toBe(ComponentType.Button);
    expect(first?.custom_id).toBe(encodePanel("evt-1"));
  });

  it("description に今日の活動有無と次回の活動日をテキストで出す", () => {
    const payload = renderPublicMessage(
      summaryOf([active22("2026-07-25", 0), active22("2026-07-28", 1)]),
      NOW,
    );
    const description = firstEmbed(payload).description ?? "";
    // 今日の活動は見出し(##)で強調する
    expect(description).toContain("## 🟢 今日 7/25(土) は活動日");
    expect(description).toContain("次回の活動: 7/28(火)");
  });

  it("event.description を先頭に載せる", () => {
    const payload = renderPublicMessage(
      summaryOf([active22("2026-07-28", 0)], {
        description: "零式の予定です",
      }),
      NOW,
    );
    const description = firstEmbed(payload).description ?? "";
    expect(description.startsWith("零式の予定です")).toBe(true);
  });

  it("回答済みフィールドは回答者をメンションで並べ、人数を出す", () => {
    const tally: OptionTally = {
      responseOptionId: "o-1320",
      label: "22:00〜",
      kind: "time",
      count: 2,
      respondentIds: ["u1", "u2"],
    };
    const payload = renderPublicMessage(
      summaryOf([
        candSummary("2026-07-25", 0, {
          startTimes: [timeTally(1320, 2)],
          optionTallies: [tally],
        }),
      ]),
      NOW,
    );
    const field = (firstEmbed(payload).fields ?? []).find((f) =>
      f.name.startsWith("回答済み"),
    );
    expect(field?.name).toBe("回答済み (2/8人)");
    expect(field?.value).toContain("<@u1>");
    expect(field?.value).toContain("<@u2>");
  });

  it("回答が無ければ回答済みは0人でプレースホルダ", () => {
    const payload = renderPublicMessage(
      summaryOf([emptyDay("2026-07-28", 0)]),
      NOW,
    );
    const field = (firstEmbed(payload).fields ?? []).find((f) =>
      f.name.startsWith("回答済み"),
    );
    expect(field?.name).toBe("回答済み (0/8人)");
    expect(field?.value).toBe("まだ回答がありません");
  });

  it("日付なし候補は候補(日付なし)フィールドで情報を残す(カレンダーには載らない)", () => {
    const undated: CandidateSummary = {
      candidate: { id: "c-x", label: "第1回", startsAt: null, position: 0 },
      optionTallies: [
        {
          responseOptionId: "o-yes",
          label: "いつでも",
          kind: "yes",
          count: 3,
          respondentIds: ["a", "b", "c"],
        },
      ],
      startTimes: [],
      anytimeCount: 3,
      maybeCount: 0,
      unavailableCount: 0,
    };
    const payload = renderPublicMessage(summaryOf([undated]), NOW);
    const fields = firstEmbed(payload).fields ?? [];
    const field = fields.find((f) => f.name === "候補(日付なし)");
    expect(field?.value).toContain("第1回");
    expect(field?.value).toContain("いつでも");
    // 日付なしのみなのでカレンダーは出ない
    expect(fields.some((f) => f.name.startsWith("📅"))).toBe(false);
  });
});
