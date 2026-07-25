import type { ScheduleEvent } from "./scheduleEvent.js";

/** 削除を試みるアクター(Discord 非依存の素の権限)。 */
export interface DeleteActor {
  readonly userId: string;
  /** サーバーのイベント管理権限(Discord の ManageEvents 相当)を持つか。 */
  readonly hasManagePermission: boolean;
}

/** 作成者本人、または管理権限を持つアクターだけがイベントを削除できる。 */
export function canDeleteEvent(
  event: ScheduleEvent,
  actor: DeleteActor,
): boolean {
  return event.creatorId === actor.userId || actor.hasManagePermission;
}
