import type { ScheduleEvent } from "../../domain/schedule/scheduleEvent.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";

export interface DeleteScheduleEventDeps {
  repository: ScheduleRepository;
}

/**
 * イベントを物理削除する。候補・選択肢・回答は cascade で消える。
 * 削除した ScheduleEvent を返す(呼び出し側が messageId で公開メッセージを消せるように)。
 * 既に存在しない場合は削除せず null を返す。
 */
export function makeDeleteScheduleEvent(
  deps: DeleteScheduleEventDeps,
): (input: { eventId: string }) => Promise<ScheduleEvent | null> {
  return async (input) => {
    const event = await deps.repository.findById(input.eventId);
    if (!event) {
      return null;
    }
    await deps.repository.delete(event.id);
    return event;
  };
}
