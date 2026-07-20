import type {
  ScheduleEventListItem,
  ScheduleRepository,
} from "./ports/scheduleRepository.js";

export interface ListScheduleEventsDeps {
  repository: ScheduleRepository;
}

export function makeListScheduleEvents(
  deps: ListScheduleEventsDeps,
): (input: { guildId: string }) => Promise<ScheduleEventListItem[]> {
  return (input) => deps.repository.listByGuild(input.guildId);
}
