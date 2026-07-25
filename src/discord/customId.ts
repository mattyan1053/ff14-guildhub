export const NAMESPACE = "sch";
export const VERSION = "v1";

export type ScheduleAction = "panel" | "delete";

export interface DecodedCustomId {
  readonly action: ScheduleAction;
  readonly eventId: string;
}

const SEP = ":";
const PREFIX = `${NAMESPACE}${SEP}${VERSION}`;

/** 一覧の選択メニューの custom_id(選んだ eventId は value 側で運ぶ)。 */
export const LIST_SELECT = `${PREFIX}${SEP}list`;

/** 削除確認パネルの「やめる」ボタン(状態を持たない固定 custom_id)。 */
export const DELETE_CANCEL = `${PREFIX}${SEP}delete-cancel`;

/** "sch:v1:panel:<eventId>"(公開メッセージの「回答する」ボタン) */
export function encodePanel(eventId: string): string {
  return `${PREFIX}${SEP}panel${SEP}${eventId}`;
}

/** "sch:v1:delete:<eventId>"(削除確認パネルの「削除する」ボタン) */
export function encodeDeleteConfirm(eventId: string): string {
  return `${PREFIX}${SEP}delete${SEP}${eventId}`;
}

/** 自分のNS/バージョン/既知アクション以外や壊れた入力は null */
export function decode(customId: string): DecodedCustomId | null {
  const parts = customId.split(SEP);
  const [ns, version, action, eventId] = parts;
  if (ns !== NAMESPACE || version !== VERSION || eventId === undefined) {
    return null;
  }
  if (parts.length !== 4) {
    return null;
  }
  if (action === "panel" || action === "delete") {
    return { action, eventId };
  }
  return null;
}
