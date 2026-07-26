import { decideDayStatus } from "./activity.js";
import { dateValueFromStartsAt } from "./datePresets.js";
import type { ScheduleSummary } from "./summary.js";
import { pad2 } from "./time.js";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 当日活動リマインド1通ぶんの内容(ADR 0011)。 */
export interface DailyReminder {
  readonly eventId: string;
  readonly guildSeq: number;
  readonly title: string;
  /** active のときの開始分。active-anytime(いつでも)のときは null */
  readonly startMinute: number | null;
  /** イベントに回答履歴がある userId(重複なし・初出順)= 参加者としてメンションする対象 */
  readonly mentionUserIds: readonly string[];
}

/** now を JST の暦日 "YYYY-MM-DD" と、JST の0時からの経過分(0..1439)に分解する。 */
export function jstClock(now: Date): { dateValue: string; minute: number } {
  // now を +9h ずらして UTC フィールドとして読むと JST の暦日・時刻になる(datePresets と同じ手法)。
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const dateValue = `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
  return { dateValue, minute: jst.getUTCHours() * 60 + jst.getUTCMinutes() };
}

/**
 * リマインド送信時刻の入力 "H:MM" / "HH:MM" を 0..1439 の分に解析する。
 * 前後の空白はトリムする。形式不正・範囲外は null。
 */
export function parseReminderTime(input: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/** 回答履歴のある userId を、候補position→選択肢position→回答順の走査で初出順に集める。 */
function collectRespondentIds(summary: ScheduleSummary): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of summary.candidates) {
    for (const tally of candidate.optionTallies) {
      for (const userId of tally.respondentIds) {
        if (!seen.has(userId)) {
          seen.add(userId);
          out.push(userId);
        }
      }
    }
  }
  return out;
}

/**
 * todayValue(JST暦日 "YYYY-MM-DD")の候補日が活動あり(active / active-anytime)なら
 * リマインド内容を返す。該当候補なし・pending・rest は null(沈黙)。
 * 同日の候補が複数ある場合は position 順で最初に active 系になったものを採用する。
 */
export function planDailyReminder(
  summary: ScheduleSummary,
  todayValue: string,
): DailyReminder | null {
  for (const candidateSummary of summary.candidates) {
    const startsAt = candidateSummary.candidate.startsAt;
    if (startsAt === null || dateValueFromStartsAt(startsAt) !== todayValue) {
      continue;
    }
    const status = decideDayStatus(candidateSummary);
    if (status.kind !== "active" && status.kind !== "active-anytime") {
      continue;
    }
    return {
      eventId: summary.event.id,
      guildSeq: summary.event.guildSeq,
      title: summary.event.title,
      startMinute: status.kind === "active" ? status.startMinute : null,
      mentionUserIds: collectRespondentIds(summary),
    };
  }
  return null;
}
