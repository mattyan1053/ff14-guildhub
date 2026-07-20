import {
  buildScheduleEvent,
  type CandidateSpec,
  type ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import {
  buildResponseOptionSpecs,
  normalizeCandidateLabels,
  parseTimeSlots,
} from "../../domain/schedule/validation.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";
import type { Clock, IdGenerator } from "./ports/support.js";

export interface CreateScheduleEventInput {
  guildId: string;
  channelId: string;
  creatorId: string;
  title: string;
  description: string | null;
  candidateLines: string[];
  timeSlotLines: string[];
  candidateStartsAt?: (Date | null)[];
}

export interface CreateScheduleEventOutput {
  event: ScheduleEvent;
}

export interface CreateScheduleEventDeps {
  repository: ScheduleRepository;
  newId: IdGenerator;
  now: Clock;
}

export function makeCreateScheduleEvent(
  deps: CreateScheduleEventDeps,
): (input: CreateScheduleEventInput) => Promise<CreateScheduleEventOutput> {
  return async (input) => {
    const labels = normalizeCandidateLabels(input.candidateLines);
    const timeSlots = parseTimeSlots(input.timeSlotLines);
    const responseOptions = buildResponseOptionSpecs(timeSlots);
    const startsAt = input.candidateStartsAt ?? [];
    const candidates: CandidateSpec[] = labels.map((label, index) => ({
      label,
      startsAt: startsAt[index] ?? null,
    }));

    const guildSeq = await deps.repository.nextGuildSeq(input.guildId);
    const event = buildScheduleEvent(
      {
        guildId: input.guildId,
        channelId: input.channelId,
        creatorId: input.creatorId,
        guildSeq,
        title: input.title,
        description: input.description,
        candidates,
        responseOptions,
      },
      { newId: deps.newId, now: deps.now },
    );

    await deps.repository.create(event);
    return { event };
  };
}
