import type { CandidateSummary } from "./summary.js";

/**
 * フルパーティの人数(8人)。活動有無の判定には使わず、回答済み人数の目標(N/8)として
 * 表示に使う。回答者が揃ったかは各自がこの人数を見て判断する。
 * ライト(4人)/アライアンス(24人)対応時はイベント設定へ持ち上げる。
 */
export const PARTY_SIZE = 8;

/**
 * 候補日の活動状態。
 * - active / active-anytime: 全員参加可能。開始時刻(または「いつでも」)を持つ。
 * - pending: 不可はいないが未定がいる。未定の人の連絡待ち。
 * - rest: 誰かが不可なので活動しない(休み)。
 */
export type DayStatus =
  | { readonly kind: "active"; readonly startMinute: number }
  | { readonly kind: "active-anytime" }
  | { readonly kind: "pending" }
  | { readonly kind: "rest" };

/**
 * 候補日の活動可否を決める(FF14固有の運用ルール)。優先順は 不可 > 未定 > 活動あり。
 * - 誰かが不可なら、その日はそもそも成立しないので休み(未定がいても考慮不要)。
 * - 不可はいないが未定がいるなら、未定の人の連絡待ちで「未定」。
 * - 不可も未定もいなければ活動あり。時刻指定があれば全員が来られる最も遅い時刻を開始にし、
 *   時刻指定が無ければ「いつでも」。回答ゼロでもデフォルトで活動あり(いつでも)。
 */
export function decideDayStatus(candidate: CandidateSummary): DayStatus {
  if (candidate.unavailableCount > 0) {
    return { kind: "rest" };
  }
  if (candidate.maybeCount > 0) {
    return { kind: "pending" };
  }
  // 参加可能な回答のうち時刻を指定したもの(count>0 の time 選択肢)を拾う。
  const countByOptionId = new Map(
    candidate.optionTallies.map((tally) => [
      tally.responseOptionId,
      tally.count,
    ]),
  );
  const pickedMinutes = candidate.startTimes
    .filter((slot) => (countByOptionId.get(slot.responseOptionId) ?? 0) > 0)
    .map((slot) => slot.startMinute);
  if (pickedMinutes.length === 0) {
    return { kind: "active-anytime" };
  }
  return { kind: "active", startMinute: Math.max(...pickedMinutes) };
}
