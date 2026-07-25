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
import { hhmm } from "../../domain/schedule/time.js";
import {
  buildAnsiCalendarFields,
  ANSI_RESET as RESET,
  SGR_BLACK,
  SGR_BLUEGRAY,
  SGR_CYAN,
  SGR_GREEN,
  SGR_RED,
  SGR_VIOLET,
  SGR_YELLOW,
} from "./ansiCalendar.js";

// 候補日を「その日に活動があるか・何時からか」で塗り分けたカレンダー(作成ビルダーと
// 同じ等幅 ANSI グリッド)を組み立てる。開始時刻ごとに背景色を割り当て、実際の時刻は
// 凡例(buildLegendField)で説明する。セルには日付数字しか入らないため、色=時刻の対応は
// 凡例が担う。

// 活動あり=緑系 / 未定=黄 / 休み=黒 を直感的な対応にする。いちばん普通の活動日である
// 「いつでも(時刻指定なし)」を緑にし、時刻指定は緑と衝突しない緑隣接色から順に割り当てる。
// 時刻は増えうるため一色に固定できず、種類が増えたら緑から離れていく(固定活動の候補時刻は
// 通常1〜3種)。実際の色相は凡例が同じ SGR を描いて意味を固定する。Discord の ansi 背景は 40-47 のみ。
const TIME_PALETTE = [
  SGR_CYAN, // 青緑 ← 緑に最も近いが「いつでも」の緑と区別する
  SGR_BLUEGRAY, // 灰青
  SGR_VIOLET, // 菫
  SGR_RED, // 朱
];
// 「いつでも」は活動あり・時刻未指定のいちばん普通の活動日なので緑にする。時刻指定は上の
// パレット(緑以外)を使うので、混在しても凡例で別々の意味に割り当てて判別できる。
const ANYTIME_SGR = SGR_GREEN; // 緑: いつでも(活動あり・時刻なし)
const PENDING_SGR = SGR_YELLOW; // 黄: 未定(連絡待ち)
const REST_SGR = SGR_BLACK; // 黒: 活動なし(休み)

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

/**
 * 候補日(startsAt を持つもの)を月ごとの Embed フィールド(等幅ANSIカレンダー)にする。
 * 各候補日は活動の開始時刻/いつでも/休みで背景色を塗る。日付を持つ候補が無ければ空。
 */
export function buildActivityCalendarFields(summary: ScheduleSummary) {
  const dated = datedCandidates(summary);
  if (dated.length === 0) {
    return [];
  }
  const scheme = activityColorScheme(summary);
  return buildAnsiCalendarFields(
    dated.map(
      ({ value, candidate }) =>
        [value, sgrForStatus(decideDayStatus(candidate), scheme)] as const,
    ),
    { fieldName: (key) => `📅 ${key}` },
  );
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

/** DayStatus を状態ラベルにする(rest/pending も含む・カレンダーに載らない候補の明細用)。 */
function statusLabel(status: DayStatus): string {
  switch (status.kind) {
    case "active":
      return `${hhmm(status.startMinute)}開始`;
    case "active-anytime":
      return "いつでも";
    case "pending":
      return "未定(連絡待ち)";
    default:
      return "活動なし(休み)";
  }
}

/** 参加可能(いつでも/時刻指定)と回答した人数。 */
function attendableCount(candidate: CandidateSummary): number {
  return candidate.optionTallies
    .filter((tally) => tally.kind === "yes" || tally.kind === "time")
    .reduce((sum, tally) => sum + tally.count, 0);
}

/**
 * startsAt を持たない候補(旧作成モーダル製やカスタムラベル)の明細を1行ずつ返す。
 * これらはカレンダーに載らないため、ここで状態と人数を出して情報を失わないようにする。
 */
export function formatUndatedCandidateLines(
  summary: ScheduleSummary,
): string[] {
  return summary.candidates
    .filter((candidate) => candidate.candidate.startsAt === null)
    .map((candidate) => {
      const status = decideDayStatus(candidate);
      return `• ${candidate.candidate.label} — ${statusLabel(status)}(参加可 ${attendableCount(
        candidate,
      )} / 未定 ${candidate.maybeCount} / 不可 ${candidate.unavailableCount})`;
    });
}
