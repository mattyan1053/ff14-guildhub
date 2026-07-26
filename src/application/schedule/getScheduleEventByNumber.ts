import type { ScheduleEvent } from "../../domain/schedule/scheduleEvent.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";

export interface GetScheduleEventByNumberDeps {
  repository: ScheduleRepository;
}

/**
 * guild 内連番でイベントを引く(削除の番号解決・権限判定・確認表示に使う読み取り)。
 * 集計はせず、ドメインの ScheduleEvent をそのまま返す。
 */
export function makeGetScheduleEventByNumber(
  deps: GetScheduleEventByNumberDeps,
): (input: {
  guildId: string;
  guildSeq: number;
}) => Promise<ScheduleEvent | null> {
  return async (input) =>
    await deps.repository.findByGuildSeq(input.guildId, input.guildSeq);
}
