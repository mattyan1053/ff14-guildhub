import {
  ActionRowBuilder,
  type BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import {
  formatDateLabel,
  startsAtFromDateValue,
} from "../../domain/schedule/datePresets.js";

// ビルダーのコンポーネントID(ADR 0006)。候補日は Embed フィールドを真実源にし、
// 時刻セレクトはコンポーネントの default を真実源にする。
export const BUILDER_DAY_PREFIX = "sch:v1:bld:day:";
export const BUILDER_WEEK_PREFIX = "sch:v1:bld:week:";
export const BUILDER_PERIOD_BUTTON = "sch:v1:bld:period";
export const BUILDER_TITLE_BUTTON = "sch:v1:bld:title";
export const BUILDER_SET_TIMES_BUTTON = "sch:v1:bld:settimes";
export const BUILDER_SUBMIT_BUTTON = "sch:v1:bld:submit";
export const BUILDER_CANCEL_BUTTON = "sch:v1:bld:cancel";

export const BUILDER_TITLE_MODAL = "sch:v1:bld:title-modal";
export const BUILDER_SET_TIMES_MODAL = "sch:v1:bld:settimes-modal";
export const BUILDER_PERIOD_MODAL = "sch:v1:bld:period-modal";

const SELECTED_FIELD_NAME = "候補日(カレンダー)";
const SELECTED_FIELD_EMPTY = "（まだありません。日付ボタンで選択してください)";
const TIME_FIELD_NAME = "候補時刻(任意)";
const TIME_FIELD_EMPTY = "（指定なし。回答は ○いつでも / △未定 / ✖不可 のみ)";
const TIME_PATTERN = /\d{1,2}:\d{2}/g;
const WEEKDAY_HEADER = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
  .map((weekday) => ` ${weekday} `)
  .join("");
const MAX_BUTTONS_PER_ROW = 5;

// ANSI SGR。選択日は太字・白文字・青紫背景でセルをハイライトする。
const ANSI_ESC = String.fromCharCode(27);
const ANSI_SELECTED = `${ANSI_ESC}[1;37;45m`;
const ANSI_RESET = `${ANSI_ESC}[0m`;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 日番号を2桁幅(前ゼロなし・空白埋め)に整える。 */
function cellNum(value: number): string {
  return String(value).padStart(2, " ");
}

/** 1ヶ月分のカレンダー(ヘッダ + 週行)。選択日は ANSI で背景色ハイライトする。 */
function monthGrid(
  year: number,
  month: number,
  selectedDays: ReadonlySet<number>,
): string {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: string[] = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push("    ");
  }
  for (let day = 1; day <= days; day += 1) {
    const cell = ` ${cellNum(day)} `;
    cells.push(
      selectedDays.has(day) ? `${ANSI_SELECTED}${cell}${ANSI_RESET}` : cell,
    );
  }
  const rows = [`${year}-${pad2(month)}`, WEEKDAY_HEADER];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7).join(""));
  }
  return rows.join("\n");
}

/**
 * 選択済み候補日を月ごとの Embed フィールド(等幅ANSIカレンダー)にする。
 * Embed の1フィールドは1024文字上限のため、月ごとに別フィールドへ分ける。
 * 空なら非空プレースホルダの1フィールド。
 */
function buildCalendarFields(
  selectedDates: readonly string[],
): { name: string; value: string }[] {
  const byMonth = new Map<string, Set<number>>();
  for (const value of selectedDates) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      continue;
    }
    const key = `${match[1]}-${match[2]}`;
    const set = byMonth.get(key) ?? new Set<number>();
    set.add(Number(match[3]));
    byMonth.set(key, set);
  }
  if (byMonth.size === 0) {
    return [{ name: SELECTED_FIELD_NAME, value: SELECTED_FIELD_EMPTY }];
  }
  return [...byMonth.keys()].sort().map((key) => {
    const [year, month] = key.split("-").map(Number);
    const grid = monthGrid(
      year as number,
      month as number,
      byMonth.get(key) as Set<number>,
    );
    return {
      name: `${SELECTED_FIELD_NAME} ${key}`,
      value: `\`\`\`ansi\n${grid}\n\`\`\``,
    };
  });
}

/**
 * カレンダー文字列から YYYY-MM-DD を昇順で復元する。月ヘッダ YYYY-MM と、
 * ANSI でハイライトされた日(ESC[..m dd ESC[0m)を拾う。
 */
function parseSelectedDates(text: string): string[] {
  const esc = String.fromCharCode(27);
  const pattern = new RegExp(
    `(\\d{4})-(\\d{2})|${esc}\\[[0-9;]*m\\s*(\\d{1,2})\\s*${esc}\\[0m`,
    "g",
  );
  const out: string[] = [];
  let month: string | null = null;
  for (const match of text.matchAll(pattern)) {
    if (match[1] && match[2]) {
      month = `${match[1]}-${match[2]}`;
    } else if (match[3] && month) {
      out.push(`${month}-${pad2(Number(match[3]))}`);
    }
  }
  return out.sort();
}

export interface DayOption {
  readonly value: string;
  readonly label: string;
}

export interface BuilderState {
  readonly title: string | null;
  readonly description: string | null;
  /** 表示中の週(0=今週) */
  readonly weekOffset: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  /** 表示中の週の7日 */
  readonly weekDays: readonly DayOption[];
  /** 全選択済み候補日 YYYY-MM-DD(昇順)。Embed フィールドが真実源 */
  readonly selectedDates: readonly string[];
  /** 候補時刻 "HH:MM"(昇順。空=時刻指定なし)。Embed フィールドが真実源 */
  readonly timeSlots: readonly string[];
}

export interface CreateInputFromBuilder {
  readonly title: string;
  readonly description: string | null;
  readonly candidateLines: string[];
  readonly candidateStartsAt: (Date | null)[];
  readonly timeSlotLines: string[];
}

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );
}

/** 表示中の週の日ボタン(選択済みは Success)を最大5個/行で並べる。 */
function dayRows(
  weekDays: readonly DayOption[],
  selected: ReadonlySet<string>,
): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < weekDays.length; i += MAX_BUTTONS_PER_ROW) {
    const chunk = weekDays.slice(i, i + MAX_BUTTONS_PER_ROW);
    rows.push(
      row(
        ...chunk.map((day) =>
          new ButtonBuilder()
            .setCustomId(`${BUILDER_DAY_PREFIX}${day.value}`)
            .setLabel(day.label)
            .setStyle(
              selected.has(day.value)
                ? ButtonStyle.Success
                : ButtonStyle.Secondary,
            ),
        ),
      ),
    );
  }
  return rows;
}

function pagingRow(state: BuilderState): Row {
  return row(
    new ButtonBuilder()
      .setCustomId(`${BUILDER_WEEK_PREFIX}${state.weekOffset - 1}`)
      .setLabel("◀ 前週")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!state.canPrev),
    new ButtonBuilder()
      .setCustomId(`${BUILDER_WEEK_PREFIX}${state.weekOffset + 1}`)
      .setLabel("次週 ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!state.canNext),
    new ButtonBuilder()
      .setCustomId(BUILDER_SET_TIMES_BUTTON)
      .setLabel("時刻を設定")
      .setStyle(ButtonStyle.Secondary),
  );
}

/** 最上段:タイトル/説明の編集と期間の設定。 */
function topActionRow(): Row {
  return row(
    new ButtonBuilder()
      .setCustomId(BUILDER_TITLE_BUTTON)
      .setLabel("タイトル/説明を編集")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(BUILDER_PERIOD_BUTTON)
      .setLabel("期間を設定")
      .setStyle(ButtonStyle.Secondary),
  );
}

/** 最下段:作成 / キャンセルのみ。 */
function bottomActionRow(): Row {
  return row(
    new ButtonBuilder()
      .setCustomId(BUILDER_SUBMIT_BUTTON)
      .setLabel("作成")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(BUILDER_CANCEL_BUTTON)
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * 作成ビルダーのエフェメラルパネルを組み立てる(純粋)。
 * 候補日は週ページングのトグルボタン、選択済みは Embed フィールドに保持する。
 */
export function renderCreateBuilder(state: BuilderState): BaseMessageOptions {
  const selected = new Set(state.selectedDates);
  const embed = new EmbedBuilder().addFields(
    ...buildCalendarFields(state.selectedDates),
    {
      name: TIME_FIELD_NAME,
      value:
        state.timeSlots.length > 0
          ? state.timeSlots.join(", ")
          : TIME_FIELD_EMPTY,
    },
  );
  if (state.title !== null) {
    embed.setTitle(state.title);
  }
  if (state.description !== null) {
    embed.setDescription(state.description);
  }

  return {
    embeds: [embed],
    components: [
      topActionRow(),
      ...dayRows(state.weekDays, selected),
      pagingRow(state),
      bottomActionRow(),
    ],
    allowedMentions: { parse: [] },
  };
}

interface RawComponent {
  type: number;
  custom_id?: string;
  label?: string;
  disabled?: boolean;
  options?: { value: string; label: string; default?: boolean }[];
}

function toData(value: unknown): { [key: string]: unknown } {
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

function flatComponents(payload: BaseMessageOptions): RawComponent[] {
  const out: RawComponent[] = [];
  for (const rowValue of payload.components ?? []) {
    const rowData = toData(rowValue) as { components?: unknown[] };
    for (const comp of rowData.components ?? []) {
      out.push(comp as RawComponent);
    }
  }
  return out;
}

function embedFieldsText(payload: BaseMessageOptions): string {
  const embed = toData(payload.embeds?.[0]) as {
    fields?: { value?: string }[];
  };
  return (embed.fields ?? []).map((field) => field.value ?? "").join("\n");
}

function readWeek(comps: RawComponent[]): {
  weekOffset: number;
  canPrev: boolean;
  canNext: boolean;
} {
  const weeks = comps
    .filter((c) => (c.custom_id ?? "").startsWith(BUILDER_WEEK_PREFIX))
    .map((c) => ({
      target: Number((c.custom_id as string).slice(BUILDER_WEEK_PREFIX.length)),
      disabled: Boolean(c.disabled),
    }))
    .sort((a, b) => a.target - b.target);
  const prev = weeks[0];
  const next = weeks[1];
  if (!prev || !next) {
    return { weekOffset: 0, canPrev: false, canNext: false };
  }
  return {
    weekOffset: (prev.target + next.target) / 2,
    canPrev: !prev.disabled,
    canNext: !next.disabled,
  };
}

/**
 * renderCreateBuilder が生成した payload から BuilderState を復元する。
 * 候補日・候補時刻はいずれも Embed フィールドから読み戻す。
 */
export function parseBuilderState(payload: BaseMessageOptions): BuilderState {
  const embed = toData(payload.embeds?.[0]) as {
    title?: string;
    description?: string;
  };
  const comps = flatComponents(payload);
  const week = readWeek(comps);
  const fieldsText = embedFieldsText(payload);

  const weekDays: DayOption[] = comps
    .filter((c) => (c.custom_id ?? "").startsWith(BUILDER_DAY_PREFIX))
    .map((c) => ({
      value: (c.custom_id as string).slice(BUILDER_DAY_PREFIX.length),
      label: c.label ?? "",
    }));

  return {
    title: embed.title ?? null,
    description: embed.description ?? null,
    weekOffset: week.weekOffset,
    canPrev: week.canPrev,
    canNext: week.canNext,
    weekDays,
    selectedDates: parseSelectedDates(fieldsText),
    timeSlots: (fieldsText.match(TIME_PATTERN) ?? []).sort(),
  };
}

/**
 * 選択済みの候補日・候補時刻から createScheduleEvent への入力を作る(純粋)。
 * candidateLines と candidateStartsAt は同じ index で対応する。
 */
export function builderStateToCreateInput(
  state: BuilderState,
): CreateInputFromBuilder {
  return {
    title: state.title ?? "",
    description: state.description,
    candidateLines: state.selectedDates.map(
      (value) => formatDateLabel(value) ?? value,
    ),
    candidateStartsAt: state.selectedDates.map((value) =>
      startsAtFromDateValue(value),
    ),
    timeSlotLines: [...state.timeSlots],
  };
}
