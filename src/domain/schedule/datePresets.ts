const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export interface DatePreset {
  /** JSTの暦日 "YYYY-MM-DD" */
  readonly value: string;
  /** "M/D(曜)" 例 "7/22(水)" */
  readonly label: string;
  /** その暦日の 00:00 JST を表す UTC Date */
  readonly startsAt: Date;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** JSTの暦日(UTCフィールドがJSTの年月日を表すDate)から DatePreset を作る。 */
function presetFromJstDay(jstDay: Date): DatePreset {
  const year = jstDay.getUTCFullYear();
  const month = jstDay.getUTCMonth() + 1;
  const day = jstDay.getUTCDate();
  const value = `${year}-${pad2(month)}-${pad2(day)}`;
  const label = `${month}/${day}(${WEEKDAYS[jstDay.getUTCDay()]})`;
  // 00:00 JST を実UTCで表す(=JST暦日の0時から9時間引く)。
  const startsAt = new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS);
  return { value, label, startsAt };
}

/** now(JST)の暦日 00:00 を「UTCフィールドがJST暦日を表すDate」の実UTCミリ秒で返す。 */
function jstMidnightBase(now: Date): number {
  // now を +9h ずらし、UTCフィールドとして読むとJSTの暦日になる。
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  return Date.UTC(
    jstNow.getUTCFullYear(),
    jstNow.getUTCMonth(),
    jstNow.getUTCDate(),
  );
}

/**
 * 今日(JST)から offset 週(offset*7 日)進めた週の7日を昇順で返す
 * (today+offset*7 .. +6)。月・年をまたいでも連続する。JST固定(ADR 0006)。
 */
export function weekWindow(now: Date, offset: number): DatePreset[] {
  const base = jstMidnightBase(now) + offset * 7 * DAY_MS;
  const presets: DatePreset[] = [];
  for (let i = 0; i < 7; i += 1) {
    presets.push(presetFromJstDay(new Date(base + i * DAY_MS)));
  }
  return presets;
}

/**
 * "YYYY-MM-DD"(ゼロ埋め4-2-2)を 00:00 JST の UTC Date に変換する。
 * 形式不一致は null(カスタム候補日ラベル等はここで null になる)。
 */
export function startsAtFromDateValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS);
}

/**
 * startValue..endValue("YYYY-MM-DD")の全日を昇順で返す(両端含む)。
 * 逆順で渡しても昇順に整える。形式不一致は空配列。
 */
export function datesBetween(startValue: string, endValue: string): string[] {
  const start = startsAtFromDateValue(startValue);
  const end = startsAtFromDateValue(endValue);
  if (!start || !end) {
    return [];
  }
  const lo = Math.min(start.getTime(), end.getTime());
  const hi = Math.max(start.getTime(), end.getTime());
  const out: string[] = [];
  for (let time = lo; time <= hi; time += DAY_MS) {
    out.push(presetFromJstDay(new Date(time + JST_OFFSET_MS)).value);
  }
  return out;
}

/** "YYYY-MM-DD" を "M/D(曜)" に整形する。形式不一致は null。 */
export function formatDateLabel(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const jstDay = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return presetFromJstDay(jstDay).label;
}
