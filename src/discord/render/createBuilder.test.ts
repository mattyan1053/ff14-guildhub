import {
  type BaseMessageOptions,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { describe, expect, it } from "vitest";
import { startsAtFromDateValue } from "../../domain/schedule/datePresets.js";
import {
  BUILDER_CANCEL_BUTTON,
  BUILDER_DAY_PREFIX,
  BUILDER_PERIOD_BUTTON,
  BUILDER_SET_TIMES_BUTTON,
  BUILDER_SUBMIT_BUTTON,
  BUILDER_TITLE_BUTTON,
  BUILDER_WEEK_PREFIX,
  type BuilderState,
  builderStateToCreateInput,
  parseBuilderState,
  renderCreateBuilder,
} from "./createBuilder.js";

interface RawButton {
  type: number;
  custom_id?: string;
  label?: string;
  style?: number;
  disabled?: boolean;
}

interface RawEmbed {
  title?: string;
  description?: string;
  fields?: { name: string; value: string }[];
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

/** payload 内の全コンポーネント(行を展開)を JSON 化して取り出す。 */
function allComponents(payload: BaseMessageOptions): { type: number }[] {
  const out: { type: number }[] = [];
  for (const row of payload.components ?? []) {
    const json = toJson(row) as { components?: unknown[] };
    for (const comp of json.components ?? []) {
      out.push(comp as { type: number });
    }
  }
  return out;
}

function buttons(payload: BaseMessageOptions): RawButton[] {
  return allComponents(payload).filter(
    (c) => c.type === ComponentType.Button,
  ) as RawButton[];
}

function dayButtons(payload: BaseMessageOptions): RawButton[] {
  return buttons(payload).filter((b) =>
    (b.custom_id ?? "").startsWith(BUILDER_DAY_PREFIX),
  );
}

function weekButtons(payload: BaseMessageOptions): RawButton[] {
  return buttons(payload).filter((b) =>
    (b.custom_id ?? "").startsWith(BUILDER_WEEK_PREFIX),
  );
}

/** StringSelect(プルダウン)コンポーネントを取り出す。新仕様では常に0件のはず。 */
function stringSelects(payload: BaseMessageOptions): { type: number }[] {
  return allComponents(payload).filter(
    (c) => c.type === ComponentType.StringSelect,
  );
}

function firstEmbed(payload: BaseMessageOptions): RawEmbed {
  return toJson(payload.embeds?.[0]) as RawEmbed;
}

/** Embed の全フィールド value を連結する(title/description は含めない)。 */
function embedFieldsText(payload: BaseMessageOptions): string {
  const embed = firstEmbed(payload);
  return (embed.fields ?? []).map((f) => f.value).join("\n");
}

/** Embed 内の全文字列(title/description/fields)を連結する。 */
function embedText(payload: BaseMessageOptions): string {
  const embed = firstEmbed(payload);
  return `${embed.title ?? ""}\n${embed.description ?? ""}\n${embedFieldsText(payload)}`;
}

describe("renderCreateBuilder / parseBuilderState の往復", () => {
  it("代表的な状態(週ページング + 別週を含む選択済み候補日 + 時刻)を保存する", () => {
    const state: BuilderState = {
      title: "固定練習",
      description: "夜に開始想定",
      weekOffset: 1,
      canPrev: true,
      canNext: true,
      weekDays: [
        { value: "2026-07-29", label: "7/29(水)" },
        { value: "2026-07-30", label: "7/30(木)" },
        { value: "2026-07-31", label: "7/31(金)" },
        { value: "2026-08-01", label: "8/1(土)" },
        { value: "2026-08-02", label: "8/2(日)" },
        { value: "2026-08-03", label: "8/3(月)" },
        { value: "2026-08-04", label: "8/4(火)" },
      ],
      // 表示中の週(offset=1)に無い日も混ぜて昇順で保持する
      selectedDates: ["2026-07-22", "2026-07-30", "2026-08-10"],
      timeSlots: ["21:00", "22:00"],
    };

    const restored = parseBuilderState(renderCreateBuilder(state));

    expect(restored).toEqual(state);
  });

  it("単一月に収まる選択済み候補日をカレンダー経由で往復する", () => {
    const state: BuilderState = {
      title: "固定練習",
      description: "夜に開始想定",
      weekOffset: 0,
      canPrev: false,
      canNext: true,
      weekDays: [
        { value: "2026-07-22", label: "7/22(水)" },
        { value: "2026-07-23", label: "7/23(木)" },
        { value: "2026-07-24", label: "7/24(金)" },
        { value: "2026-07-25", label: "7/25(土)" },
        { value: "2026-07-26", label: "7/26(日)" },
        { value: "2026-07-27", label: "7/27(月)" },
        { value: "2026-07-28", label: "7/28(火)" },
      ],
      selectedDates: ["2026-07-22", "2026-07-25"],
      timeSlots: ["21:00", "22:00"],
    };

    const restored = parseBuilderState(renderCreateBuilder(state));

    expect(restored).toEqual(state);
  });

  it("複数月にまたがる選択済み候補日を月ヘッダごとのカレンダーで往復する", () => {
    const state: BuilderState = {
      title: null,
      description: null,
      weekOffset: 1,
      canPrev: true,
      canNext: true,
      weekDays: [
        { value: "2026-07-29", label: "7/29(水)" },
        { value: "2026-07-30", label: "7/30(木)" },
        { value: "2026-07-31", label: "7/31(金)" },
        { value: "2026-08-01", label: "8/1(土)" },
        { value: "2026-08-02", label: "8/2(日)" },
        { value: "2026-08-03", label: "8/3(月)" },
        { value: "2026-08-04", label: "8/4(火)" },
      ],
      // 7月末と8月にまたがる。8/10 は表示中の週には無い。
      selectedDates: ["2026-07-30", "2026-08-02", "2026-08-10"],
      timeSlots: ["21:00"],
    };

    const payload = renderCreateBuilder(state);
    const text = embedText(payload);
    // 各月の YYYY-MM ヘッダが両方出る
    expect(text).toContain("2026-07");
    expect(text).toContain("2026-08");

    expect(parseBuilderState(payload)).toEqual(state);
  });

  it("timeSlots が空([])の状態も往復して空配列に戻る", () => {
    const state: BuilderState = {
      title: "固定練習",
      description: "夜に開始想定",
      weekOffset: 0,
      canPrev: false,
      canNext: true,
      weekDays: [
        { value: "2026-07-22", label: "7/22(水)" },
        { value: "2026-07-23", label: "7/23(木)" },
      ],
      selectedDates: ["2026-07-22", "2026-07-25"],
      timeSlots: [],
    };

    const restored = parseBuilderState(renderCreateBuilder(state));

    expect(restored).toEqual(state);
  });

  it("title/description が null の状態も往復して null に戻る", () => {
    const state: BuilderState = {
      title: null,
      description: null,
      weekOffset: 0,
      canPrev: false,
      canNext: true,
      weekDays: [
        { value: "2026-07-22", label: "7/22(水)" },
        { value: "2026-07-23", label: "7/23(木)" },
      ],
      selectedDates: [],
      timeSlots: ["21:00"],
    };

    const restored = parseBuilderState(renderCreateBuilder(state));

    expect(restored).toEqual(state);
  });

  it("境界: weekOffset=0 で canPrev=false のとき前週ボタンが disabled で往復する", () => {
    const state: BuilderState = {
      title: null,
      description: null,
      weekOffset: 0,
      canPrev: false,
      canNext: true,
      weekDays: [{ value: "2026-07-22", label: "7/22(水)" }],
      selectedDates: [],
      timeSlots: [],
    };

    const payload = renderCreateBuilder(state);

    // 前週ボタン(target = weekOffset-1 = -1)が disabled
    const prev = weekButtons(payload).find(
      (b) => b.custom_id === `${BUILDER_WEEK_PREFIX}-1`,
    );
    expect(prev).toBeDefined();
    expect((prev as RawButton).disabled).toBe(true);

    const restored = parseBuilderState(payload);
    expect(restored.canPrev).toBe(false);
    expect(restored.canNext).toBe(true);
    expect(restored.weekOffset).toBe(0);
  });

  it("境界: 上限週で canNext=false のとき次週ボタンが disabled で往復する", () => {
    const state: BuilderState = {
      title: null,
      description: null,
      weekOffset: 8,
      canPrev: true,
      canNext: false,
      weekDays: [{ value: "2026-09-16", label: "9/16(水)" }],
      selectedDates: [],
      timeSlots: [],
    };

    const payload = renderCreateBuilder(state);

    const next = weekButtons(payload).find(
      (b) => b.custom_id === `${BUILDER_WEEK_PREFIX}9`,
    );
    expect(next).toBeDefined();
    expect((next as RawButton).disabled).toBe(true);

    const restored = parseBuilderState(payload);
    expect(restored.canNext).toBe(false);
    expect(restored.canPrev).toBe(true);
    expect(restored.weekOffset).toBe(8);
  });
});

describe("大きな範囲(3ヶ月)のカレンダー", () => {
  it("月ごとに別フィールドで出し、各フィールドは1024文字以内で往復する", () => {
    // 7/1〜9/30 の全日(約92日)を選択した状態。
    const selectedDates: string[] = [];
    for (const [month, days] of [
      [7, 31],
      [8, 31],
      [9, 30],
    ] as const) {
      for (let day = 1; day <= days; day += 1) {
        selectedDates.push(
          `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        );
      }
    }
    const state: BuilderState = {
      title: "3ヶ月",
      description: null,
      weekOffset: 0,
      canPrev: false,
      canNext: true,
      weekDays: [{ value: "2026-07-22", label: "7/22(水)" }],
      selectedDates,
      timeSlots: [],
    };

    const payload = renderCreateBuilder(state);
    const fields = firstEmbed(payload).fields ?? [];

    // 候補日は月ごとに別フィールド(7/8/9月)+ 時刻フィールド
    const monthFields = fields.filter((f) => f.value.includes("```ansi"));
    expect(monthFields.length).toBe(3);
    // Discord のフィールド value 上限 1024 を超えない
    for (const field of fields) {
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
    // 往復で全日が復元される
    expect(parseBuilderState(payload)).toEqual(state);
  });
});

describe("renderCreateBuilder のコンポーネント構造", () => {
  const state: BuilderState = {
    title: "固定練習",
    description: null,
    weekOffset: 1,
    canPrev: true,
    canNext: true,
    weekDays: [
      { value: "2026-07-29", label: "7/29(水)" },
      { value: "2026-07-30", label: "7/30(木)" },
      { value: "2026-07-31", label: "7/31(金)" },
      { value: "2026-08-01", label: "8/1(土)" },
      { value: "2026-08-02", label: "8/2(日)" },
      { value: "2026-08-03", label: "8/3(月)" },
      { value: "2026-08-04", label: "8/4(火)" },
    ],
    selectedDates: ["2026-07-30", "2026-08-01"],
    timeSlots: ["21:00", "23:00"],
  };

  it("表示中の週の7日ぶんの日ボタンを value ごとに出す", () => {
    const payload = renderCreateBuilder(state);
    const days = dayButtons(payload);

    expect(days).toHaveLength(7);
    expect(days.map((b) => b.custom_id)).toEqual(
      state.weekDays.map((d) => `${BUILDER_DAY_PREFIX}${d.value}`),
    );
    expect(days.map((b) => b.label)).toEqual(
      state.weekDays.map((d) => d.label),
    );
  });

  it("選択済みの日ボタンだけ Success、他は Secondary", () => {
    const payload = renderCreateBuilder(state);
    const days = dayButtons(payload);

    for (const button of days) {
      const value = (button.custom_id ?? "").slice(BUILDER_DAY_PREFIX.length);
      const expected = state.selectedDates.includes(value)
        ? ButtonStyle.Success
        : ButtonStyle.Secondary;
      expect(button.style).toBe(expected);
    }
    // 選択済みは2件だけ Success
    expect(days.filter((b) => b.style === ButtonStyle.Success)).toHaveLength(2);
  });

  it("前週/次週ボタンを weekOffset±1 の customId で出す", () => {
    const payload = renderCreateBuilder(state);
    const weeks = weekButtons(payload);

    const ids = weeks.map((b) => b.custom_id);
    expect(ids).toContain(`${BUILDER_WEEK_PREFIX}0`); // 前週 = weekOffset-1
    expect(ids).toContain(`${BUILDER_WEEK_PREFIX}2`); // 次週 = weekOffset+1
    // canPrev/canNext がともに true なので両方 enabled
    for (const button of weeks) {
      expect(Boolean(button.disabled)).toBe(false);
    }
  });

  it("「期間を設定」ボタンを出す", () => {
    const ids = buttons(renderCreateBuilder(state)).map((b) => b.custom_id);

    expect(ids).toContain(BUILDER_PERIOD_BUTTON);
  });

  it("タイトル/説明・時刻設定・作成・キャンセルの操作ボタンを出す", () => {
    const payload = renderCreateBuilder(state);
    const ids = buttons(payload).map((b) => b.custom_id);

    expect(ids).toContain(BUILDER_TITLE_BUTTON);
    expect(ids).toContain(BUILDER_SET_TIMES_BUTTON);
    expect(ids).toContain(BUILDER_SUBMIT_BUTTON);
    expect(ids).toContain(BUILDER_CANCEL_BUTTON);
  });

  it("プルダウン(StringSelect)は一切出さない", () => {
    const payload = renderCreateBuilder(state);

    expect(stringSelects(payload)).toHaveLength(0);
  });

  it("候補時刻は Embed に各 HH:MM をプレビュー表示する", () => {
    const payload = renderCreateBuilder(state);
    const text = embedText(payload);

    expect(text).toContain("21:00");
    expect(text).toContain("23:00");
  });

  it("候補時刻が空なら時刻を含まない非空プレースホルダを出す", () => {
    const payload = renderCreateBuilder({ ...state, timeSlots: [] });
    const fieldsText = embedFieldsText(payload);

    // 時刻フィールドは存在し、value は非空(空文字は Discord が拒否する)
    expect(fieldsText.trim().length).toBeGreaterThan(0);
    // HH:MM 形式の時刻は含まない
    expect(fieldsText).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("選択済み候補日をANSIカラーのカレンダーで表示する(選択日をハイライト)", () => {
    // 7/22 週。22(水)/25(土)を選択し、23(木)は未選択のまま。
    const calState: BuilderState = {
      ...state,
      selectedDates: ["2026-07-22", "2026-07-25"],
    };
    const text = embedText(renderCreateBuilder(calState));

    // ANSI コードブロックで出す
    expect(text).toContain("```ansi");
    // 月ヘッダ YYYY-MM が出る
    expect(text).toContain("2026-07");
    // 選択日は ANSI エスケープ(ESC[..m 22 ESC[0m)で色付けされる
    const colored = (day: number): boolean =>
      new RegExp(`\\u001b\\[[0-9;]*m\\s*${day}\\s*\\u001b\\[0m`).test(text);
    expect(colored(22)).toBe(true);
    expect(colored(25)).toBe(true);
    // 同月の未選択日は色付けされない
    expect(colored(23)).toBe(false);
  });

  it("title/description は embed の title/description に一対一で対応する", () => {
    const restored = parseBuilderState(
      renderCreateBuilder({
        ...state,
        title: "タイトルX",
        description: "説明Y",
      }),
    );

    expect(restored.title).toBe("タイトルX");
    expect(restored.description).toBe("説明Y");
  });
});

describe("selectedDates の復元", () => {
  it("表示中の週(weekDays)に無い日も Embed フィールドから復元される", () => {
    const state: BuilderState = {
      title: null,
      description: null,
      weekOffset: 0,
      canPrev: false,
      canNext: true,
      weekDays: [
        { value: "2026-07-22", label: "7/22(水)" },
        { value: "2026-07-23", label: "7/23(木)" },
      ],
      // 表示外の週の日だけを選択済みにする
      selectedDates: ["2026-08-05", "2026-08-12"],
      timeSlots: [],
    };

    const restored = parseBuilderState(renderCreateBuilder(state));

    expect(restored.selectedDates).toEqual(["2026-08-05", "2026-08-12"]);
  });

  it("選択済みが空でも Embed フィールドは非空プレースホルダで、復元は空配列", () => {
    const state: BuilderState = {
      title: null,
      description: null,
      weekOffset: 0,
      canPrev: false,
      canNext: true,
      weekDays: [{ value: "2026-07-22", label: "7/22(水)" }],
      selectedDates: [],
      timeSlots: [],
    };

    const payload = renderCreateBuilder(state);
    const embed = firstEmbed(payload);

    // フィールドは存在し、いずれも value は非空(空文字は Discord が拒否する)
    const fields = embed.fields ?? [];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field.value.trim().length).toBeGreaterThan(0);
    }
    // プレースホルダは日付も角かっこマークも含まない
    const fieldText = fields.map((f) => f.value).join("\n");
    expect(fieldText).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(fieldText).not.toContain("[");
    // ただし日付は含まれないので復元は空
    expect(parseBuilderState(payload).selectedDates).toEqual([]);
  });
});

describe("timeSlots の復元", () => {
  it("Embed の時刻プレビューから HH:MM を昇順で復元する", () => {
    const state: BuilderState = {
      title: null,
      description: null,
      weekOffset: 0,
      canPrev: false,
      canNext: true,
      weekDays: [{ value: "2026-07-22", label: "7/22(水)" }],
      selectedDates: ["2026-07-22"],
      timeSlots: ["21:00", "22:30"],
    };

    const restored = parseBuilderState(renderCreateBuilder(state));

    expect(restored.timeSlots).toEqual(["21:00", "22:30"]);
  });

  it("候補日のカレンダー(ANSI)は時刻抽出に混入しない", () => {
    const state: BuilderState = {
      title: null,
      description: null,
      weekOffset: 0,
      canPrev: false,
      canNext: true,
      weekDays: [{ value: "2026-07-22", label: "7/22(水)" }],
      // 複数月・複数日ぶんのカレンダー(: を含まない)があっても時刻は0件
      selectedDates: ["2026-07-22", "2026-08-05", "2026-08-12"],
      timeSlots: [],
    };

    const restored = parseBuilderState(renderCreateBuilder(state));

    expect(restored.timeSlots).toEqual([]);
    expect(restored.selectedDates).toEqual([
      "2026-07-22",
      "2026-08-05",
      "2026-08-12",
    ]);
  });
});

describe("builderStateToCreateInput", () => {
  const state: BuilderState = {
    title: "固定練習",
    description: "夜に開始想定",
    weekOffset: 0,
    canPrev: false,
    canNext: true,
    weekDays: [
      { value: "2026-07-22", label: "7/22(水)" },
      { value: "2026-07-23", label: "7/23(木)" },
    ],
    selectedDates: ["2026-07-22", "2026-07-29"],
    timeSlots: ["21:00", "23:00"],
  };

  it("candidateLines は selectedDates 全件を formatDateLabel で整形する(昇順)", () => {
    const input = builderStateToCreateInput(state);

    expect(input.candidateLines).toEqual(["7/22(水)", "7/29(水)"]);
  });

  it("candidateStartsAt を value ごとに startsAtFromDateValue で解決し index を対応させる", () => {
    const input = builderStateToCreateInput(state);

    expect(input.candidateStartsAt).toHaveLength(input.candidateLines.length);
    expect(input.candidateStartsAt[0]?.getTime()).toBe(
      startsAtFromDateValue("2026-07-22")?.getTime(),
    );
    expect(input.candidateStartsAt[1]?.getTime()).toBe(
      startsAtFromDateValue("2026-07-29")?.getTime(),
    );
    // すべて YYYY-MM-DD なので null は無い
    expect(input.candidateStartsAt.every((d) => d !== null)).toBe(true);
  });

  it("timeSlotLines は timeSlots をそのまま(順序維持)入れる", () => {
    const input = builderStateToCreateInput(state);

    expect(input.timeSlotLines).toEqual(["21:00", "23:00"]);
  });

  it("title をそのまま渡す", () => {
    expect(builderStateToCreateInput(state).title).toBe("固定練習");
  });

  it("description が null のときは null を渡す", () => {
    expect(
      builderStateToCreateInput({ ...state, description: null }).description,
    ).toBeNull();
  });

  it("selectedDates 空 & timeSlots 空なら3配列とも空", () => {
    const empty: BuilderState = {
      ...state,
      selectedDates: [],
      timeSlots: [],
    };

    const input = builderStateToCreateInput(empty);

    expect(input.candidateLines).toEqual([]);
    expect(input.candidateStartsAt).toEqual([]);
    expect(input.timeSlotLines).toEqual([]);
  });
});
