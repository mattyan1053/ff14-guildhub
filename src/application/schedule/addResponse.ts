import { ScheduleValidationError } from "../../domain/schedule/errors.js";
import {
  type ScheduleSummary,
  summarizeResponses,
} from "../../domain/schedule/summary.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";
import type { Clock, IdGenerator } from "./ports/support.js";

export interface AddResponseInput {
  eventId: string;
  candidateId: string;
  responseOptionId: string;
  userId: string;
}

export interface AddResponseOutput {
  summary: ScheduleSummary;
}

export interface AddResponseDeps {
  repository: ScheduleRepository;
  newId: IdGenerator;
  now: Clock;
}

export function makeAddResponse(
  deps: AddResponseDeps,
): (input: AddResponseInput) => Promise<AddResponseOutput> {
  return async (input) => {
    const event = await deps.repository.findById(input.eventId);
    if (!event) {
      throw new Error(`event not found: ${input.eventId}`);
    }

    const belongsToCandidate = event.candidates.some(
      (candidate) => candidate.id === input.candidateId,
    );
    if (!belongsToCandidate) {
      throw new ScheduleValidationError([
        `候補がイベントに属していません: ${input.candidateId}`,
      ]);
    }
    const belongsToOption = event.responseOptions.some(
      (option) => option.id === input.responseOptionId,
    );
    if (!belongsToOption) {
      throw new ScheduleValidationError([
        `選択肢がイベントに属していません: ${input.responseOptionId}`,
      ]);
    }

    await deps.repository.upsertResponse({
      id: deps.newId(),
      eventId: event.id,
      candidateId: input.candidateId,
      responseOptionId: input.responseOptionId,
      userId: input.userId,
      now: deps.now(),
    });

    const responses = await deps.repository.listResponses(event.id);
    return { summary: summarizeResponses(event, responses) };
  };
}
