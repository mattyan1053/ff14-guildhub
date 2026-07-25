import {
  dateValueFromStartsAt,
  startsAtFromDateValue,
} from "../../domain/schedule/datePresets.js";
import type { ScheduleEvent } from "../../domain/schedule/scheduleEvent.js";
import type { ScheduleSummary } from "../../domain/schedule/summary.js";
import { currentAnswerOptionId } from "./panelModel.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 回答パネル(ADR 0008)の純粋モデル。1ユーザーの下書き(候補日ごとの回答種別)を
// 扱う。discord.js には依存しない。下書きの真実源は Embed の「下書き明細」テキストで、
// draftDetailText / parseDraftDetail が往復を担う(背景色からは復元しない)。

/** 1候補日の下書き回答。attend=参加可(いつでも/未入力の既定)。 */
export type DraftKind =
  | "attend"
  | "maybe"
  | "no"
  | { readonly startMinute: number };

/** 候補日(YYYY-MM-DD)→下書き回答。日付つき候補だけを持つ。 */
export type Draft = ReadonlyMap<string, DraftKind>;

function isTime(kind: DraftKind): kind is { readonly startMinute: number } {
  return typeof kind === "object";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 分(0..1439)を "HH:MM" に整形する。 */
export function hhmm(startMinute: number): string {
  return `${pad2(Math.floor(startMinute / 60))}:${pad2(startMinute % 60)}`;
}

/** イベントの responseOptions から種別ごとの optionId を引く。 */
function optionIds(event: ScheduleEvent): {
  yes: string | null;
  maybe: string | null;
  no: string | null;
  timeByMinute: Map<number, string>;
} {
  let yes: string | null = null;
  let maybe: string | null = null;
  let no: string | null = null;
  const timeByMinute = new Map<number, string>();
  for (const option of event.responseOptions) {
    if (option.kind === "yes") {
      yes ??= option.id;
    } else if (option.kind === "maybe") {
      maybe ??= option.id;
    } else if (option.kind === "no") {
      no ??= option.id;
    } else if (option.kind === "time" && option.startMinute !== null) {
      timeByMinute.set(option.startMinute, option.id);
    }
  }
  return { yes, maybe, no, timeByMinute };
}

/** イベントの時刻選択肢を startMinute 昇順で返す。 */
export function eventTimes(
  event: ScheduleEvent,
): { startMinute: number; label: string; optionId: string }[] {
  return event.responseOptions
    .filter((o) => o.kind === "time" && o.startMinute !== null)
    .map((o) => ({
      startMinute: o.startMinute as number,
      label: o.label,
      optionId: o.id,
    }))
    .sort((a, b) => a.startMinute - b.startMinute);
}

/** optionId → 下書き種別(不明なら attend)。 */
function kindFromOptionId(
  event: ScheduleEvent,
  optionId: string | null,
): DraftKind {
  if (optionId === null) {
    return "attend";
  }
  const option = event.responseOptions.find((o) => o.id === optionId);
  if (!option) {
    return "attend";
  }
  if (option.kind === "maybe") {
    return "maybe";
  }
  if (option.kind === "no") {
    return "no";
  }
  if (option.kind === "time" && option.startMinute !== null) {
    return { startMinute: option.startMinute };
  }
  return "attend"; // yes(いつでも)含む
}

/** 集計からその人の下書き初期値を作る(既存回答を反映、無ければ参加可)。 */
export function initialDraft(summary: ScheduleSummary, userId: string): Draft {
  const draft = new Map<string, DraftKind>();
  for (const candidate of summary.candidates) {
    const startsAt = candidate.candidate.startsAt;
    if (!startsAt) {
      continue;
    }
    const dateValue = dateValueFromStartsAt(startsAt);
    const optionId = currentAnswerOptionId(candidate, userId);
    draft.set(dateValue, kindFromOptionId(summary.event, optionId));
  }
  return draft;
}

/** 指定した日付だけ kind を変えた新しい下書きを返す(下書きに無い日付は無視)。 */
export function applyKind(
  draft: Draft,
  dateValues: readonly string[],
  kind: DraftKind,
): Draft {
  const next = new Map(draft);
  for (const value of dateValues) {
    if (next.has(value)) {
      next.set(value, kind);
    }
  }
  return next;
}

/** dateValue(YYYY-MM-DD)を含む週の日曜(YYYY-MM-DD)を返す。JST の曜日で判定する。 */
function weekStartOf(dateValue: string): string {
  const startsAt = startsAtFromDateValue(dateValue);
  if (!startsAt) {
    return dateValue;
  }
  // startsAt は 00:00 JST。+9h して UTC 曜日を読むと JST の曜日になる(0=日)。
  const dow = new Date(startsAt.getTime() + JST_OFFSET_MS).getUTCDay();
  return dateValueFromStartsAt(new Date(startsAt.getTime() - dow * DAY_MS));
}

/** 候補日を含む週(日曜起点)の一覧を昇順で返す(候補の無い週は含めない)。 */
export function candidateWeeks(dateValues: readonly string[]): string[] {
  const weeks = new Set<string>();
  for (const value of dateValues) {
    weeks.add(weekStartOf(value));
  }
  return [...weeks].sort();
}

/** 指定した週(日曜 YYYY-MM-DD)に含まれる候補日を昇順で返す。 */
export function daysInWeek(
  dateValues: readonly string[],
  weekStart: string,
): string[] {
  return dateValues.filter((value) => weekStartOf(value) === weekStart).sort();
}

const NO_MARK = "不可";
const MAYBE_MARK = "未定";
const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/g;

/**
 * 下書きの例外(attend 以外)を種別ごとに列挙した真実源テキストを作る。
 * 順序: 不可 → 未定 → 時刻(昇順)。attend(参加可)は既定なので出さない。
 */
export function draftDetailText(draft: Draft): string {
  const no: string[] = [];
  const maybe: string[] = [];
  const times = new Map<number, string[]>();
  for (const [value, kind] of [...draft].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (kind === "no") {
      no.push(value);
    } else if (kind === "maybe") {
      maybe.push(value);
    } else if (isTime(kind)) {
      const list = times.get(kind.startMinute) ?? [];
      list.push(value);
      times.set(kind.startMinute, list);
    }
  }
  const lines: string[] = [];
  if (no.length > 0) {
    lines.push(`${NO_MARK} … ${no.join(", ")}`);
  }
  if (maybe.length > 0) {
    lines.push(`${MAYBE_MARK} … ${maybe.join(", ")}`);
  }
  for (const minute of [...times.keys()].sort((a, b) => a - b)) {
    lines.push(
      `${hhmm(minute)} … ${(times.get(minute) as string[]).join(", ")}`,
    );
  }
  return lines.join("\n");
}

/** draftDetailText の逆。例外の日付→種別 だけを返す(attend は含まない)。 */
export function parseDraftDetail(text: string): Map<string, DraftKind> {
  const out = new Map<string, DraftKind>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }
    const head = line.split("…")[0]?.trim() ?? "";
    let kind: DraftKind | null = null;
    if (head === NO_MARK) {
      kind = "no";
    } else if (head === MAYBE_MARK) {
      kind = "maybe";
    } else {
      const time = /^(\d{1,2}):(\d{2})$/.exec(head);
      if (time) {
        kind = { startMinute: Number(time[1]) * 60 + Number(time[2]) };
      }
    }
    if (!kind) {
      continue;
    }
    for (const date of line.match(DATE_PATTERN) ?? []) {
      out.set(date, kind);
    }
  }
  return out;
}

export interface CommitEntry {
  readonly candidateId: string;
  readonly responseOptionId: string;
}

/**
 * 下書きを addResponses への入力へ変換する(「完了」)。日付つき候補すべてに1行:
 * attend→yes・maybe→未定・no→不可・時刻→その時刻。日付なし候補は対象外。
 */
export function commitEntries(
  event: ScheduleEvent,
  draft: Draft,
): CommitEntry[] {
  const ids = optionIds(event);
  const entries: CommitEntry[] = [];
  for (const candidate of event.candidates) {
    if (!candidate.startsAt) {
      continue;
    }
    const dateValue = dateValueFromStartsAt(candidate.startsAt);
    const kind = draft.get(dateValue) ?? "attend";
    let optionId: string | null;
    if (kind === "maybe") {
      optionId = ids.maybe;
    } else if (kind === "no") {
      optionId = ids.no;
    } else if (isTime(kind)) {
      optionId = ids.timeByMinute.get(kind.startMinute) ?? ids.yes;
    } else {
      optionId = ids.yes;
    }
    if (optionId) {
      entries.push({ candidateId: candidate.id, responseOptionId: optionId });
    }
  }
  return entries;
}
