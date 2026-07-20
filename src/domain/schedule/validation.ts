import { ScheduleValidationError } from "./errors.js";
import { MAX_TIME_SLOTS } from "./limits.js";
import type { ResponseOptionSpec } from "./scheduleEvent.js";

export { MAX_CANDIDATES, MAX_LABEL_LENGTH, MAX_TIME_SLOTS } from "./limits.js";

export const LABEL_ANYTIME = "いつでも";
export const LABEL_UNDECIDED = "未定";
export const LABEL_UNAVAILABLE = "不可";

export interface TimeSlot {
  readonly label: string;
  readonly startMinute: number;
}

/**
 * 候補ラベルを正規化する。
 * トリム / 空行除去 / 重複除去(順序維持)。件数チェックはここでは行わない。
 */
export function normalizeCandidateLabels(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const label = line.trim();
    if (label === "" || seen.has(label)) {
      continue;
    }
    seen.add(label);
    result.push(label);
  }
  return result;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 時刻スロット行を解析する。
 * 受理形式: "H:MM" / "HH:MM"(任意で末尾に "〜" または "-")。0..1439 分。
 * 不正な行・範囲外・時刻の重複・MAX_TIME_SLOTS 超過は ScheduleValidationError。
 * 昇順にソートして返す。
 */
export function parseTimeSlots(lines: readonly string[]): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const seen = new Set<number>();
  const issues: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    const body = trimmed.replace(/[-〜]$/, "");
    const match = /^(\d{1,2}):(\d{2})$/.exec(body);
    if (!match) {
      issues.push(`時刻の形式が不正です: ${trimmed}`);
      continue;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      issues.push(`時刻が範囲外です: ${trimmed}`);
      continue;
    }
    const startMinute = hours * 60 + minutes;
    if (seen.has(startMinute)) {
      issues.push(`時刻が重複しています: ${trimmed}`);
      continue;
    }
    seen.add(startMinute);
    slots.push({ label: `${pad2(hours)}:${pad2(minutes)}〜`, startMinute });
  }

  if (slots.length > MAX_TIME_SLOTS) {
    issues.push(`候補時刻は最大 ${MAX_TIME_SLOTS} 件までです`);
  }
  if (issues.length > 0) {
    throw new ScheduleValidationError(issues);
  }

  return [...slots].sort((a, b) => a.startMinute - b.startMinute);
}

/**
 * 状態集合を組み立てる。
 * [いつでも(yes)] + [時刻(time, 昇順)] + [未定(maybe)] + [不可(no)]。
 */
export function buildResponseOptionSpecs(
  timeSlots: readonly TimeSlot[],
): ResponseOptionSpec[] {
  return [
    { label: LABEL_ANYTIME, kind: "yes", startMinute: null },
    ...timeSlots.map(
      (slot): ResponseOptionSpec => ({
        label: slot.label,
        kind: "time",
        startMinute: slot.startMinute,
      }),
    ),
    { label: LABEL_UNDECIDED, kind: "maybe", startMinute: null },
    { label: LABEL_UNAVAILABLE, kind: "no", startMinute: null },
  ];
}
