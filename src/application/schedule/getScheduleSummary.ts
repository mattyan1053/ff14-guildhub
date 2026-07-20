import {
  type ScheduleSummary,
  summarizeResponses,
} from "../../domain/schedule/summary.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";

export interface GetScheduleSummaryDeps {
  repository: ScheduleRepository;
}

export function makeGetScheduleSummary(
  deps: GetScheduleSummaryDeps,
): (input: { eventId: string }) => Promise<ScheduleSummary | null> {
  return async (input) => {
    const event = await deps.repository.findById(input.eventId);
    if (!event) {
      return null;
    }
    const responses = await deps.repository.listResponses(event.id);
    return summarizeResponses(event, responses);
  };
}
