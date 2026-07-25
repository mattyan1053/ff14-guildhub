import {
  ActionRowBuilder,
  type BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import {
  dateValueFromStartsAt,
  formatDateLabel,
} from "../../domain/schedule/datePresets.js";
import type { ScheduleEvent } from "../../domain/schedule/scheduleEvent.js";
import {
  candidateWeeks,
  type Draft,
  type DraftKind,
  daysInWeek,
  draftDetailChunks,
  eventTimes,
  hhmm,
  initialDraft,
  parseDraftDetail,
} from "./answerPanelModel.js";

// 回答パネル(ADR 0008)。自分の回答をカレンダーでプレビューしつつ、例外(不可/未定/時刻)
// だけを「週の日ボタンで対象日を選ぶ → 適用selectで種別を選ぶ」でマークする。週送りで
// 移動し、選択できる日はボタンとして見えている(プルダウンを開かないと分からない、を避ける)。
// 下書きの真実源は Embed の「下書き明細」フィールド(draftDetailText)で、背景色からは復元しない。

const MAX_BUTTONS_PER_ROW = 5;

// custom_id。日ボタンは dateValue を、週ナビはインデックスを、適用/完了は eventId を末尾に持つ。
export const ANSWER_DAY_PREFIX = "sch:v1:ans:day:";
export const ANSWER_WEEK_PREFIX = "sch:v1:ans:week:";
export const ANSWER_APPLY_PREFIX = "sch:v1:ans:apply:";
export const ANSWER_DONE_PREFIX = "sch:v1:ans:done:";
export const ANSWER_CLOSE = "sch:v1:ans:close";

// 下書き明細フィールド。1024字上限を跨ぐと複数フィールドに分割するので、名前は
// この接頭辞で始める(parse は接頭辞一致で全部集めて連結する)。
const DETAIL_FIELD_PREFIX = "📝 回答の下書き";
const DETAIL_FIELD_NAME = `${DETAIL_FIELD_PREFIX}(完了で確定)`;
const DETAIL_FIELD_CONT = `${DETAIL_FIELD_PREFIX}(続き)`;
const DETAIL_EMPTY =
  "すべて参加可(いつでも)。例外があれば日ボタンで選んでください。";
// Embed フィールド値の上限は1024字。余裕をもって分割する。
const MAX_FIELD_VALUE = 1000;
const LEGEND_FIELD_NAME = "凡例(背景色=あなたの回答)";

// 表示専用の4状態カラー(下書き明細が真実源なので色は判別できれば足りる)。
const ESC = String.fromCharCode(27);
const RESET = `${ESC}[0m`;
const SGR_ATTEND = `${ESC}[1;37;42m`; // 緑: 参加可(いつでも)
const SGR_TIME = `${ESC}[1;30;46m`; // シアン: 時刻指定
const SGR_MAYBE = `${ESC}[1;30;43m`; // 黄: 未定
const SGR_NO = `${ESC}[0;37;40m`; // 黒: 不可

const WEEKDAY_HEADER = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
  .map((weekday) => ` ${weekday} `)
  .join("");
const APPLY_ATTEND = "attend";
const APPLY_MAYBE = "maybe";
const APPLY_NO = "no";
// 選択中の日ボタンは Primary、未選択は Secondary。パースはこの style で見分ける。
const SELECTED_STYLE = ButtonStyle.Primary;

function cellNum(value: number): string {
  return String(value).padStart(2, " ");
}

function isTime(kind: DraftKind): kind is { readonly startMinute: number } {
  return typeof kind === "object";
}

function sgrForKind(kind: DraftKind): string {
  if (kind === "maybe") {
    return SGR_MAYBE;
  }
  if (kind === "no") {
    return SGR_NO;
  }
  if (isTime(kind)) {
    return SGR_TIME;
  }
  return SGR_ATTEND;
}

/** 短い状態記号(日ボタンのラベル用)。 */
function kindMark(kind: DraftKind): string {
  if (kind === "maybe") {
    return "△";
  }
  if (kind === "no") {
    return "✕";
  }
  if (isTime(kind)) {
    return `🕒${hhmm(kind.startMinute)}`;
  }
  return "◯";
}

/**
 * 候補日(YYYY-MM-DD)を月ごとに ANSI カレンダーへ。自分が入れた例外(不可/未定/時刻)だけを
 * 塗り、参加可/未入力は無印にする(カレンダーの色=自分が入力した内容になるように)。
 */
function buildCalendarFields(draft: Draft): { name: string; value: string }[] {
  const byMonth = new Map<string, Map<number, DraftKind>>();
  for (const [value, kind] of draft) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      continue;
    }
    const key = `${match[1]}-${match[2]}`;
    const map = byMonth.get(key) ?? new Map<number, DraftKind>();
    // 参加可(いつでも/未入力)は塗らない。月自体は候補があれば必ず表示する。
    if (kind !== "attend") {
      map.set(Number(match[3]), kind);
    }
    byMonth.set(key, map);
  }
  return [...byMonth.keys()].sort().map((key) => {
    const [year, month] = key.split("-").map(Number);
    const grid = monthGrid(
      year as number,
      month as number,
      byMonth.get(key) as Map<number, DraftKind>,
    );
    return { name: `📅 ${key}`, value: `\`\`\`ansi\n${grid}\n\`\`\`` };
  });
}

function monthGrid(
  year: number,
  month: number,
  kindByDay: ReadonlyMap<number, DraftKind>,
): string {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: string[] = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push("    ");
  }
  for (let day = 1; day <= days; day += 1) {
    const cell = ` ${cellNum(day)} `;
    const kind = kindByDay.get(day);
    cells.push(kind ? `${sgrForKind(kind)}${cell}${RESET}` : cell);
  }
  const rows = [WEEKDAY_HEADER];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7).join(""));
  }
  return rows.join("\n");
}

/** 自分が入れた例外の色の凡例。参加可/未入力は無印(色なし)であることも示す。 */
function buildLegend(event: ScheduleEvent): { name: string; value: string } {
  const parts: string[] = [];
  if (eventTimes(event).length > 0) {
    parts.push(`${SGR_TIME} 時刻指定 ${RESET}`);
  }
  parts.push(`${SGR_MAYBE} 未定 ${RESET}`, `${SGR_NO} 不可 ${RESET}`);
  return {
    name: LEGEND_FIELD_NAME,
    value: `\`\`\`ansi\n${parts.join("  ")}\n\`\`\`\n無印=いつでも参加可(未入力)`,
  };
}

/** 下書き明細フィールド(1024字上限を跨ぐと複数フィールドに分割)。空なら案内1つ。 */
function buildDetailFields(draft: Draft): { name: string; value: string }[] {
  const chunks = draftDetailChunks(draft, MAX_FIELD_VALUE);
  if (chunks.length === 0) {
    return [{ name: DETAIL_FIELD_NAME, value: DETAIL_EMPTY }];
  }
  return chunks.map((value, index) => ({
    name: index === 0 ? DETAIL_FIELD_NAME : DETAIL_FIELD_CONT,
    value,
  }));
}

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );
}

/** 週ナビ行(◀前週 / 週ラベル / 次週▶)。インデックスを custom_id に持つ。 */
function weekNavRow(
  eventId: string,
  weekIndex: number,
  weekCount: number,
  weekStart: string,
): Row {
  const label = formatDateLabel(weekStart) ?? weekStart;
  return row(
    new ButtonBuilder()
      .setCustomId(`${ANSWER_WEEK_PREFIX}${eventId}:${weekIndex - 1}`)
      .setLabel("◀ 前週")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(weekIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`${ANSWER_WEEK_PREFIX}${eventId}:x`)
      .setLabel(`${label}の週 (${weekIndex + 1}/${Math.max(1, weekCount)})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${ANSWER_WEEK_PREFIX}${eventId}:${weekIndex + 1}`)
      .setLabel("次週 ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(weekIndex >= weekCount - 1),
  );
}

/**
 * 表示中の週の候補日を、状態記号つきの日ボタンで並べる(最大5個/行)。
 * 選択中の日は Primary(色)で示し、下書き種別はラベルの記号(◯/✕/△/🕒)で示す。
 */
function dayButtonRows(
  eventId: string,
  weekDays: readonly string[],
  draft: Draft,
  selected: ReadonlySet<string>,
): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < weekDays.length; i += MAX_BUTTONS_PER_ROW) {
    const chunk = weekDays.slice(i, i + MAX_BUTTONS_PER_ROW);
    rows.push(
      row(
        ...chunk.map((value) => {
          const kind = draft.get(value) ?? "attend";
          const label = `${kindMark(kind)} ${formatDateLabel(value) ?? value}`;
          return new ButtonBuilder()
            .setCustomId(`${ANSWER_DAY_PREFIX}${eventId}:${value}`)
            .setLabel(label)
            .setStyle(
              selected.has(value) ? SELECTED_STYLE : ButtonStyle.Secondary,
            );
        }),
      ),
    );
  }
  return rows;
}

/** 選んだ日にまとめて適用する select(参加可に戻す/時刻/未定/不可)。 */
function applySelectRow(eventId: string, event: ScheduleEvent): Row {
  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel("◯ 参加可に戻す(例外を取消)")
      .setValue(APPLY_ATTEND),
    ...eventTimes(event).map((time) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`🕒 ${hhmm(time.startMinute)}スタート`)
        .setValue(`t${time.startMinute}`),
    ),
    new StringSelectMenuOptionBuilder()
      .setLabel("△ 未定(連絡待ち)")
      .setValue(APPLY_MAYBE),
    new StringSelectMenuOptionBuilder().setLabel("✕ 不可").setValue(APPLY_NO),
  ];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${ANSWER_APPLY_PREFIX}${eventId}`)
    .setPlaceholder("選んだ日をどうする？")
    .addOptions(options);
  return row(menu);
}

function bottomRow(eventId: string): Row {
  return row(
    new ButtonBuilder()
      .setCustomId(`${ANSWER_DONE_PREFIX}${eventId}`)
      .setLabel("完了(この内容で回答)")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(ANSWER_CLOSE)
      .setLabel("閉じる")
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * 回答パネルのエフェメラル payload を組み立てる(純粋)。
 * draft は候補日→回答種別、weekIndex は表示中の週、selectedDates は選択中の日。
 * 候補日を含む週だけを、週送りで移動する(候補日は日ボタンで見えている)。
 */
export function renderAnswerPanel(
  event: ScheduleEvent,
  draft: Draft,
  weekIndex: number,
  selectedDates: readonly string[],
): BaseMessageOptions {
  const dates = [...draft.keys()];
  const weeks = candidateWeeks(dates);
  const clampedIndex = Math.min(
    Math.max(0, weekIndex),
    Math.max(0, weeks.length - 1),
  );
  const weekStart = weeks[clampedIndex] ?? weeks[0] ?? "";
  const weekDays = weekStart ? daysInWeek(dates, weekStart) : [];

  const embed = new EmbedBuilder()
    .setTitle(`📝 ${event.title}  #${event.guildSeq} ・ あなたの回答`)
    .setDescription(
      "未入力の日は「いつでも参加可」。例外の日を下の日ボタンで選び、種別を選んで「完了」を押してください。",
    )
    .addFields(
      ...buildCalendarFields(draft),
      buildLegend(event),
      ...buildDetailFields(draft),
    );

  return {
    embeds: [embed],
    components: [
      weekNavRow(event.id, clampedIndex, weeks.length, weekStart),
      ...dayButtonRows(event.id, weekDays, draft, new Set(selectedDates)),
      applySelectRow(event.id, event),
      bottomRow(event.id),
    ],
    allowedMentions: { parse: [] },
  };
}

/** 開いた時点の初期パネル(既存回答を下書きへ反映)。 */
export function renderInitialAnswerPanel(
  event: ScheduleEvent,
  draft: Draft,
): BaseMessageOptions {
  return renderAnswerPanel(event, draft, 0, []);
}

export { initialDraft };

// ── パース(メッセージ=真実源) ─────────────────────────────

interface RawComponent {
  type: number;
  custom_id?: string;
  style?: number;
  disabled?: boolean;
}

function toData(value: unknown): { [k: string]: unknown } {
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

function detailFieldText(payload: BaseMessageOptions): string {
  const embed = toData(payload.embeds?.[0]) as {
    fields?: { name?: string; value?: string }[];
  };
  // 分割された明細フィールドを接頭辞一致で全部集めて連結する。
  return (embed.fields ?? [])
    .filter((f) => (f.name ?? "").startsWith(DETAIL_FIELD_PREFIX))
    .map((f) => f.value ?? "")
    .join("\n");
}

/** 週ナビの前/次インデックスから現在の週インデックスを復元する(ナビ無し=0)。 */
function readWeekIndex(comps: RawComponent[]): number {
  const targets = comps
    .filter((c) => (c.custom_id ?? "").startsWith(ANSWER_WEEK_PREFIX))
    .map((c) => (c.custom_id as string).slice(ANSWER_WEEK_PREFIX.length))
    .map((rest) => Number(rest.split(":")[1]))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const prev = targets[0];
  const next = targets[targets.length - 1];
  if (prev === undefined || next === undefined || prev === next) {
    return 0;
  }
  return (prev + next) / 2;
}

/** Primary(選択中)の日ボタンから選択中の日付を復元する。 */
function readSelectedDates(comps: RawComponent[]): string[] {
  return comps
    .filter(
      (c) =>
        (c.custom_id ?? "").startsWith(ANSWER_DAY_PREFIX) &&
        c.style === SELECTED_STYLE,
    )
    .map(
      (c) =>
        (c.custom_id as string).slice(ANSWER_DAY_PREFIX.length).split(":")[1] ??
        "",
    )
    .filter((value) => value !== "");
}

/** 適用select の value(attend/maybe/no/t<startMinute>)を DraftKind へ。不正なら null。 */
export function parseApplyValue(value: string): DraftKind | null {
  if (value === APPLY_ATTEND || value === APPLY_MAYBE || value === APPLY_NO) {
    return value;
  }
  const time = /^t(\d+)$/.exec(value);
  return time ? { startMinute: Number(time[1]) } : null;
}

export interface ParsedAnswerPanel {
  readonly draft: Draft;
  readonly weekIndex: number;
  readonly selectedDates: string[];
}

/**
 * renderAnswerPanel の payload から下書き・週・選択日を復元する。
 * 下書きは「下書き明細」フィールドのみをパースし(凡例の文字を誤読しない)、
 * 日付つき候補は既定 attend、明細にある例外だけ上書きする。選択日は Primary の日ボタン。
 */
export function parseAnswerPanel(
  payload: BaseMessageOptions,
  event: ScheduleEvent,
): ParsedAnswerPanel {
  const comps = flatComponents(payload);
  const exceptions = parseDraftDetail(detailFieldText(payload));

  // 日付つき候補は既定 attend、明細にある例外だけ上書きする。
  const draft = new Map<string, DraftKind>();
  for (const candidate of event.candidates) {
    if (!candidate.startsAt) {
      continue;
    }
    const value = dateValueFromStartsAt(candidate.startsAt);
    draft.set(value, exceptions.get(value) ?? "attend");
  }

  return {
    draft,
    weekIndex: readWeekIndex(comps),
    selectedDates: readSelectedDates(comps),
  };
}
