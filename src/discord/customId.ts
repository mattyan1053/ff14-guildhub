export const NAMESPACE = "sch";
export const VERSION = "v1";

export type ScheduleAction = "panel" | "answer" | "page";

export interface DecodedCustomId {
  readonly action: ScheduleAction;
  readonly eventId: string;
  readonly candidateId?: string;
  readonly page?: number;
}

const SEP = ":";
const PREFIX = `${NAMESPACE}${SEP}${VERSION}`;

/** 一覧の選択メニューの custom_id(選んだ eventId は value 側で運ぶ)。 */
export const LIST_SELECT = `${PREFIX}${SEP}list`;

/** "sch:v1:panel:<eventId>" */
export function encodePanel(eventId: string): string {
  return `${PREFIX}${SEP}panel${SEP}${eventId}`;
}

/** "sch:v1:answer:<eventId>:<candidateId>" */
export function encodeAnswer(eventId: string, candidateId: string): string {
  return `${PREFIX}${SEP}answer${SEP}${eventId}${SEP}${candidateId}`;
}

/** "sch:v1:page:<eventId>:<page>" */
export function encodePage(eventId: string, page: number): string {
  return `${PREFIX}${SEP}page${SEP}${eventId}${SEP}${page}`;
}

/** 自分のNS/バージョン/既知アクション以外や壊れた入力は null */
export function decode(customId: string): DecodedCustomId | null {
  const parts = customId.split(SEP);
  const [ns, version, action, eventId, extra] = parts;
  if (ns !== NAMESPACE || version !== VERSION || eventId === undefined) {
    return null;
  }
  if (action === "panel" && parts.length === 4) {
    return { action: "panel", eventId };
  }
  if (extra === undefined || parts.length !== 5) {
    return null;
  }
  if (action === "answer") {
    return { action: "answer", eventId, candidateId: extra };
  }
  if (action === "page") {
    const page = Number(extra);
    return Number.isInteger(page) ? { action: "page", eventId, page } : null;
  }
  return null;
}
