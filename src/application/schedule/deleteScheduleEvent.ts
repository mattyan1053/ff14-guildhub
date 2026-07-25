import {
  canDeleteEvent,
  type DeleteActor,
} from "../../domain/schedule/authorization.js";
import type { ScheduleEvent } from "../../domain/schedule/scheduleEvent.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";

export interface DeleteScheduleEventDeps {
  repository: ScheduleRepository;
}

export interface DeleteScheduleEventInput {
  readonly eventId: string;
  readonly actor: DeleteActor;
}

/**
 * 削除の結果。呼び出し側(ハンドラ)は outcome で応答を分岐する。
 * - deleted: 削除済み(公開メッセージ削除に使えるよう event を返す)
 * - forbidden: アクターに権限が無く、削除しなかった
 * - not_found: 対象が存在しなかった
 */
export type DeleteScheduleEventResult =
  | { readonly outcome: "deleted"; readonly event: ScheduleEvent }
  | { readonly outcome: "forbidden"; readonly event: ScheduleEvent }
  | { readonly outcome: "not_found" };

/**
 * イベントを物理削除する。候補・選択肢・回答は cascade で消える。
 * 権限判定(作成者本人 or 管理権限)をこのユースケース内で強制し、
 * 破壊操作が権限チェックを迂回しないようにする。ハンドラは Discord の
 * 権限を DeleteActor(素の権限)へマッピングするだけにする。
 */
export function makeDeleteScheduleEvent(
  deps: DeleteScheduleEventDeps,
): (input: DeleteScheduleEventInput) => Promise<DeleteScheduleEventResult> {
  return async (input) => {
    const event = await deps.repository.findById(input.eventId);
    if (!event) {
      return { outcome: "not_found" };
    }
    if (!canDeleteEvent(event, input.actor)) {
      return { outcome: "forbidden", event };
    }
    await deps.repository.delete(event.id);
    return { outcome: "deleted", event };
  };
}
