import { pad2 } from "../../domain/schedule/time.js";

// 候補日を等幅の ANSI カレンダーグリッドにする共通描画。作成ビルダー・回答パネル・
// 公開サマリーの3画面が同じ月グリッドを描くため、色の割り当て(意味づけ)だけを各
// モジュールに残し、グリッド生成とフィールド分割はここへ集約する。
//
// Discord の ansi 背景色は 40-47 のみ。各モジュールはこの SGR パレットに用途上の
// 意味(いつでも/未定/不可/選択中…)を割り当てて使う。

const ESC = String.fromCharCode(27);
export const ANSI_RESET = `${ESC}[0m`;

export const SGR_GREEN = `${ESC}[1;37;42m`; // 緑
export const SGR_CYAN = `${ESC}[1;30;46m`; // 青緑(シアン)
export const SGR_YELLOW = `${ESC}[1;30;43m`; // 黄
export const SGR_BLACK = `${ESC}[0;37;40m`; // 黒
export const SGR_VIOLET = `${ESC}[1;37;45m`; // 菫
export const SGR_BLUEGRAY = `${ESC}[1;30;44m`; // 灰青
export const SGR_RED = `${ESC}[1;37;41m`; // 朱

const WEEKDAY_HEADER = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
  .map((weekday) => ` ${weekday} `)
  .join("");

/** 日番号を2桁幅(前ゼロなし・空白埋め)に整える。 */
function cellNum(value: number): string {
  return String(value).padStart(2, " ");
}

/**
 * 1ヶ月分のカレンダー(曜日ヘッダ + 週行)。sgrByDay にある日は SGR で背景を塗る。
 * includeHeaderLine=true のときはブロック先頭に `YYYY-MM` 行を足す(そこから月を
 * 読み戻す往復用途向け)。
 */
function monthGrid(
  year: number,
  month: number,
  sgrByDay: ReadonlyMap<number, string>,
  includeHeaderLine: boolean,
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
    cells.push(sgr ? `${sgr}${cell}${ANSI_RESET}` : cell);
  }
  const rows = includeHeaderLine
    ? [`${year}-${pad2(month)}`, WEEKDAY_HEADER]
    : [WEEKDAY_HEADER];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7).join(""));
  }
  return rows.join("\n");
}

export interface AnsiField {
  readonly name: string;
  readonly value: string;
}

/**
 * 日付(YYYY-MM-DD)→背景色 SGR の対応を、月ごとの Embed フィールド(等幅ANSIカレンダー)
 * にする。Embed の1フィールドは1024字上限のため月ごとに別フィールドへ分ける。空なら空配列。
 * 色の意味づけ(状態→SGR)は呼び出し側が済ませ、ここは描画と月分割だけを担う。
 */
export function buildAnsiCalendarFields(
  dayColors: Iterable<readonly [string, string]>,
  options: {
    readonly fieldName: (monthKey: string) => string;
    readonly includeHeaderLine?: boolean;
  },
): AnsiField[] {
  const byMonth = new Map<string, Map<number, string>>();
  for (const [value, sgr] of dayColors) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      continue;
    }
    const key = `${match[1]}-${match[2]}`;
    const map = byMonth.get(key) ?? new Map<number, string>();
    map.set(Number(match[3]), sgr);
    byMonth.set(key, map);
  }
  return [...byMonth.keys()].sort().map((key) => {
    const [year, month] = key.split("-").map(Number);
    const grid = monthGrid(
      year as number,
      month as number,
      byMonth.get(key) as Map<number, string>,
      options.includeHeaderLine ?? false,
    );
    return {
      name: options.fieldName(key),
      value: `\`\`\`ansi\n${grid}\n\`\`\``,
    };
  });
}
