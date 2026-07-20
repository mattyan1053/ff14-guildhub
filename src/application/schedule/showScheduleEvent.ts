import {
  type ScheduleSummary,
  summarizeResponses,
} from "../../domain/schedule/summary.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";

export interface ShowScheduleEventDeps {
  repository: ScheduleRepository;
}

export function makeShowScheduleEvent(
  deps: ShowScheduleEventDeps,
): (input: {
  guildId: string;
  guildSeq: number;
}) => Promise<ScheduleSummary | null> {
  return async (input) => {
    const event = await deps.repository.findByGuildSeq(
      input.guildId,
      input.guildSeq,
    );
    if (!event) {
      return null;
    }
    const responses = await deps.repository.listResponses(event.id);
    return summarizeResponses(event, responses);
  };
}
