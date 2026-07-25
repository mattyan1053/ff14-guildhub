// 時刻・数値フォーマットの共通ヘルパー。render 層(カレンダー/回答パネル)と
// Discord ハンドラーで同じ整形を使い回すために domain に集約する。

/** 数値を2桁幅・前ゼロ埋めにする(例 7→"07")。 */
export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 分(0..1439)を "HH:MM" に整形する。 */
export function hhmm(startMinute: number): string {
  return `${pad2(Math.floor(startMinute / 60))}:${pad2(startMinute % 60)}`;
}
