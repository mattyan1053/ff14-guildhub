import {
  type BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import {
  formatDateLabel,
  startsAtFromDateValue,
} from "../../domain/schedule/datePresets.js";
import { parseReminderTime } from "../../domain/schedule/reminder.js";
import { hhmm, pad2 } from "../../domain/schedule/time.js";
import {
  type AnsiField,
  buildAnsiCalendarFields,
  SGR_VIOLET,
} from "./ansiCalendar.js";
import {
  buttonRows,
  flatComponents,
  type RawComponent,
  type Row,
  row,
  toData,
} from "./componentTree.js";

// ビルダーのコンポーネントID(ADR 0006)。候補日は Embed フィールドを真実源にし、
// 時刻セレクトはコンポーネントの default を真実源にする。
export const BUILDER_DAY_PREFIX = "sch:v1:bld:day:";
export const BUILDER_WEEK_PREFIX = "sch:v1:bld:week:";
export const BUILDER_PERIOD_BUTTON = "sch:v1:bld:period";
export const BUILDER_TITLE_BUTTON = "sch:v1:bld:title";
export const BUILDER_SET_TIMES_BUTTON = "sch:v1:bld:settimes";
export const BUILDER_REMIND_BUTTON = "sch:v1:bld:remind";
export const BUILDER_SUBMIT_BUTTON = "sch:v1:bld:submit";
export const BUILDER_CANCEL_BUTTON = "sch:v1:bld:cancel";

export const BUILDER_TITLE_MODAL = "sch:v1:bld:title-modal";
export const BUILDER_SET_TIMES_MODAL = "sch:v1:bld:settimes-modal";
export const BUILDER_PERIOD_MODAL = "sch:v1:bld:period-modal";
export const BUILDER_REMIND_MODAL = "sch:v1:bld:remind-modal";

const SELECTED_FIELD_NAME = "候補日(カレンダー)";
const SELECTED_FIELD_EMPTY = "（まだありません。日付ボタンで選択してください)";
const TIME_FIELD_NAME = "候補時刻(任意)";
const TIME_FIELD_EMPTY = "（指定なし。回答は ○いつでも / △未定 / ✖不可 のみ)";
const REMIND_FIELD_NAME = "当日リマインド(任意)";
const REMIND_FIELD_EMPTY =
  "（なし。作成後に /schedule remind でも設定できます)";
const TIME_PATTERN = /\d{1,2}:\d{2}/g;

/**
 * 選択済み候補日を月ごとの Embed フィールド(等幅ANSIカレンダー)にする。
 * Embed の1フィールドは1024文字上限のため、月ごとに別フィールドへ分ける。
 * 選択日は菫色で塗り、YYYY-MM 見出しをブロック内に残す(parseSelectedDates の往復用)。
 * 空なら非空プレースホルダの1フィールド。
 */
function buildCalendarFields(selectedDates: readonly string[]): AnsiField[] {
  const fields = buildAnsiCalendarFields(
    selectedDates.map((value) => [value, SGR_VIOLET] as const),
    {
      fieldName: (key) => `${SELECTED_FIELD_NAME} ${key}`,
      includeHeaderLine: true,
    },
  );
  return fields.length > 0
    ? fields
    : [{ name: SELECTED_FIELD_NAME, value: SELECTED_FIELD_EMPTY }];
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
  /** 当日リマインドの送信時刻(JSTの分)。null=リマインドなし。Embed フィールドが真実源 */
  readonly remindMinute: number | null;
}

export interface CreateInputFromBuilder {
  readonly title: string;
  readonly description: string | null;
  readonly candidateLines: string[];
  readonly candidateStartsAt: (Date | null)[];
  readonly timeSlotLines: string[];
}

/** 表示中の週の日ボタン(選択済みは Success)を最大5個/行で並べる。 */
function dayRows(
  weekDays: readonly DayOption[],
  selected: ReadonlySet<string>,
): Row[] {
  return buttonRows(weekDays, (day) =>
    new ButtonBuilder()
      .setCustomId(`${BUILDER_DAY_PREFIX}${day.value}`)
      .setLabel(day.label)
      .setStyle(
        selected.has(day.value) ? ButtonStyle.Success : ButtonStyle.Secondary,
      ),
  );
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
function topActionRow(state: BuilderState): Row {
  return row(
    new ButtonBuilder()
      .setCustomId(BUILDER_TITLE_BUTTON)
      .setLabel("タイトル/説明を編集")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(BUILDER_PERIOD_BUTTON)
      .setLabel("期間を設定")
      .setStyle(ButtonStyle.Secondary),
    // 5アクションロウを使い切っているため、リマインドは行を増やさずここに置く(ADR 0012)。
    new ButtonBuilder()
      .setCustomId(BUILDER_REMIND_BUTTON)
      .setLabel("当日リマインド")
      .setStyle(
        state.remindMinute === null
          ? ButtonStyle.Secondary
          : ButtonStyle.Success,
      ),
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
    {
      name: REMIND_FIELD_NAME,
      value:
        state.remindMinute === null
          ? REMIND_FIELD_EMPTY
          : `${hhmm(state.remindMinute)} にこのチャンネルへ送信`,
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
      topActionRow(state),
      ...dayRows(state.weekDays, selected),
      pagingRow(state),
      bottomActionRow(),
    ],
    allowedMentions: { parse: [] },
  };
}

/**
 * Embed のフィールドを name/value の組で読む。候補時刻とリマインド時刻はどちらも
 * "HH:MM" 形式なので、全文スキャンではなくフィールド単位で読み分ける必要がある。
 */
function embedFields(
  payload: BaseMessageOptions,
): { name: string; value: string }[] {
  const embed = toData(payload.embeds?.[0]) as {
    fields?: { name?: string; value?: string }[];
  };
  return (embed.fields ?? []).map((field) => ({
    name: field.name ?? "",
    value: field.value ?? "",
  }));
}

function fieldValue(
  fields: readonly { name: string; value: string }[],
  name: string,
): string {
  return fields.find((field) => field.name === name)?.value ?? "";
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
  const fields = embedFields(payload);
  // 候補日カレンダーは月ごとに複数フィールドへ分かれるため、名前の前方一致でまとめて読む。
  const calendarText = fields
    .filter((field) => field.name.startsWith(SELECTED_FIELD_NAME))
    .map((field) => field.value)
    .join("\n");
  const remindText = fieldValue(fields, REMIND_FIELD_NAME);
  const remindMatch = TIME_PATTERN.exec(remindText);
  TIME_PATTERN.lastIndex = 0;

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
    selectedDates: parseSelectedDates(calendarText),
    timeSlots: (
      fieldValue(fields, TIME_FIELD_NAME).match(TIME_PATTERN) ?? []
    ).sort(),
    remindMinute: remindMatch ? parseReminderTime(remindMatch[0]) : null,
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
