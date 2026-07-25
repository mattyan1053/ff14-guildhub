import {
  type DayStatus,
  decideDayStatus,
} from "../../domain/schedule/activity.js";
import {
  dateValueFromStartsAt,
  formatDateLabel,
} from "../../domain/schedule/datePresets.js";
import type {
  CandidateSummary,
  ScheduleSummary,
} from "../../domain/schedule/summary.js";

// 候補日を「その日に活動があるか・何時からか」で塗り分けたカレンダー(作成ビルダーと
// 同じ等幅 ANSI グリッド)を組み立てる。開始時刻ごとに背景色を割り当て、実際の時刻は
// 凡例(buildLegendField)で説明する。セルには日付数字しか入らないため、色=時刻の対応は
// 凡例が担う。

const ESC = String.fromCharCode(27);
const RESET = `${ESC}[0m`;

// 活動あり=緑系 / 未定=黄 / 休み=黒 を直感的な対応にする。開始時刻ごとに色を割り当てるが、
// 時刻は増えうるため一色に固定できない。緑に最も近い色から順に使い、種類が増えたら緑から
// 離れていく(固定活動の候補時刻は通常1〜3種なので、実質は緑まわりに収まる)。
// 実際の色相は凡例が同じ SGR を描いて意味を固定する。Discord の ansi 背景は 40-47 のみ。
const TIME_PALETTE = [
  `${ESC}[1;37;42m`, // 白 on 緑 ← 最も緑(通常の固定はここ)
  `${ESC}[1;30;44m`, // 黒 on 灰
  `${ESC}[1;37;45m`, // 白 on 菫
  `${ESC}[1;37;41m`, // 白 on 朱
];
const ANYTIME_SGR = `${ESC}[1;37;42m`; // 緑: いつでも(活動あり)
const PENDING_SGR = `${ESC}[1;30;43m`; // 黄: 未定(連絡待ち)
const REST_SGR = `${ESC}[0;37;40m`; // 黒: 活動なし(休み)

const WEEKDAY_HEADER = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
  .map((weekday) => ` ${weekday} `)
  .join("");

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 分(0..1439)を "HH:MM" に整形する。 */
function hhmm(startMinute: number): string {
  return `${pad2(Math.floor(startMinute / 60))}:${pad2(startMinute % 60)}`;
}

/** 日番号を2桁幅(前ゼロなし・空白埋め)に整える。 */
function cellNum(value: number): string {
  return String(value).padStart(2, " ");
}

interface DatedCandidate {
  readonly value: string; // YYYY-MM-DD(JST)
  readonly candidate: CandidateSummary;
}

/** startsAt を持つ候補を JST 暦日つきで取り出す(日付なしのカスタム候補は除く)。 */
function datedCandidates(summary: ScheduleSummary): DatedCandidate[] {
  const out: DatedCandidate[] = [];
  for (const candidate of summary.candidates) {
    const startsAt = candidate.candidate.startsAt;
    if (startsAt) {
      out.push({ value: dateValueFromStartsAt(startsAt), candidate });
    }
  }
  return out;
}

interface ColorScheme {
  readonly timeColors: ReadonlyMap<number, string>;
  readonly sortedTimes: readonly number[];
  readonly anytime: boolean;
  readonly pending: boolean;
  readonly rest: boolean;
}

/** イベント全体の活動日から、開始時刻→背景色の対応と凡例に必要なフラグを作る。 */
function activityColorScheme(summary: ScheduleSummary): ColorScheme {
  const times = new Set<number>();
  let anytime = false;
  let pending = false;
  let rest = false;
  for (const { candidate } of datedCandidates(summary)) {
    const status = decideDayStatus(candidate);
    if (status.kind === "active") {
      times.add(status.startMinute);
    } else if (status.kind === "active-anytime") {
      anytime = true;
    } else if (status.kind === "pending") {
      pending = true;
    } else {
      rest = true;
    }
  }
  const sortedTimes = [...times].sort((a, b) => a - b);
  const timeColors = new Map<number, string>();
  sortedTimes.forEach((minute, index) => {
    timeColors.set(
      minute,
      TIME_PALETTE[Math.min(index, TIME_PALETTE.length - 1)] as string,
    );
  });
  return { timeColors, sortedTimes, anytime, pending, rest };
}

function sgrForStatus(status: DayStatus, scheme: ColorScheme): string {
  if (status.kind === "active") {
    return scheme.timeColors.get(status.startMinute) ?? REST_SGR;
  }
  if (status.kind === "active-anytime") {
    return ANYTIME_SGR;
  }
  if (status.kind === "pending") {
    return PENDING_SGR;
  }
  return REST_SGR;
}

/** 1ヶ月分のカレンダー。候補日は活動状態別の SGR で背景を塗る。 */
function monthGrid(
  year: number,
  month: number,
  sgrByDay: ReadonlyMap<number, string>,
): string {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: string[] = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push("    ");
  }
  for (let day = 1; day <= days; day += 1) {
    const cell = ` ${cellNum(day)} `;
    const sgr = sgrByDay.get(day);
    cells.push(sgr ? `${sgr}${cell}${RESET}` : cell);
  }
  // 年月はフィールド名(📅 YYYY-MM)側に出すので、ブロック内には曜日行から並べる。
  const rows = [WEEKDAY_HEADER];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7).join(""));
  }
  return rows.join("\n");
}

/**
 * 候補日(startsAt を持つもの)を月ごとの Embed フィールド(等幅ANSIカレンダー)にする。
 * 各候補日は活動の開始時刻/いつでも/休みで背景色を塗る。日付を持つ候補が無ければ空。
 */
export function buildActivityCalendarFields(
  summary: ScheduleSummary,
): { name: string; value: string }[] {
  const dated = datedCandidates(summary);
  if (dated.length === 0) {
    return [];
  }
  const scheme = activityColorScheme(summary);

  const byMonth = new Map<string, Map<number, string>>();
  for (const { value, candidate } of dated) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      continue;
    }
    const key = `${match[1]}-${match[2]}`;
    const map = byMonth.get(key) ?? new Map<number, string>();
    map.set(Number(match[3]), sgrForStatus(decideDayStatus(candidate), scheme));
    byMonth.set(key, map);
  }

  return [...byMonth.keys()].sort().map((key) => {
    const [year, month] = key.split("-").map(Number);
    const grid = monthGrid(
      year as number,
      month as number,
      byMonth.get(key) as Map<number, string>,
    );
    return { name: `📅 ${key}`, value: `\`\`\`ansi\n${grid}\n\`\`\`` };
  });
}

/** 背景色と「開始時刻/いつでも/休み」の対応(凡例)。実際に使われている時刻だけ並べる。 */
export function buildLegendField(summary: ScheduleSummary): {
  name: string;
  value: string;
} {
  const scheme = activityColorScheme(summary);
  const parts: string[] = [];
  for (const minute of scheme.sortedTimes) {
    parts.push(`${scheme.timeColors.get(minute)} ${hhmm(minute)}開始 ${RESET}`);
  }
  if (scheme.anytime) {
    parts.push(`${ANYTIME_SGR} いつでも ${RESET}`);
  }
  if (scheme.pending) {
    parts.push(`${PENDING_SGR} 未定(連絡待ち) ${RESET}`);
  }
  parts.push(`${REST_SGR} 活動なし(休み) ${RESET}`);
  return {
    name: "凡例(背景色=活動の開始時刻)",
    value: `\`\`\`ansi\n${parts.join("  ")}\n\`\`\``,
  };
}

/** DayStatus を「22:00スタート」「いつでも」の表示文字列にする(rest は呼ばない)。 */
function startLabel(status: DayStatus): string {
  if (status.kind === "active") {
    return `${hhmm(status.startMinute)}スタート`;
  }
  return "いつでも";
}

/** 今日(JST)の活動有無をテキスト1行で返す。 */
export function formatTodayLine(summary: ScheduleSummary, now: Date): string {
  const todayValue = dateValueFromStartsAt(now);
  const label = formatDateLabel(todayValue) ?? todayValue;
  const today = datedCandidates(summary).find(
    (entry) => entry.value === todayValue,
  );
  if (today) {
    const status = decideDayStatus(today.candidate);
    if (status.kind === "active" || status.kind === "active-anytime") {
      return `🟢 今日 ${label} は活動日 ・ ${startLabel(status)}`;
    }
    if (status.kind === "pending") {
      return `🟡 今日 ${label} は未定(連絡待ち)`;
    }
  }
  return `⚪ 今日 ${label} は活動なし(休み)`;
}

/**
 * 明日以降で最も近い「活動しうる日」をテキスト1行で返す。休み以外(活動あり/未定)を拾い、
 * 未定の日はその日の未定者から連絡が来れば活動になるため連絡待ちとして出す。無ければ予定なし。
 */
export function formatNextActivityLine(
  summary: ScheduleSummary,
  now: Date,
): string {
  const todayValue = dateValueFromStartsAt(now);
  const next = datedCandidates(summary)
    .filter((entry) => entry.value > todayValue)
    .map((entry) => ({ ...entry, status: decideDayStatus(entry.candidate) }))
    .filter((entry) => entry.status.kind !== "rest")
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))[0];
  if (!next) {
    return "⏭ 次回の活動: 予定なし";
  }
  const label = formatDateLabel(next.value) ?? next.value;
  const detail =
    next.status.kind === "pending" ? "未定(連絡待ち)" : startLabel(next.status);
  return `⏭ 次回の活動: ${label} ・ ${detail}`;
}

/** 日付つき候補が1件でもあるか(今日/次回テキストを出す価値があるか)。 */
export function hasDatedCandidates(summary: ScheduleSummary): boolean {
  return datedCandidates(summary).length > 0;
}
