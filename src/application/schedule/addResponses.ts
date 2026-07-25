import { ScheduleValidationError } from "../../domain/schedule/errors.js";
import {
  type ScheduleSummary,
  summarizeResponses,
} from "../../domain/schedule/summary.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";
import type { Clock, IdGenerator } from "./ports/support.js";

export interface ResponseEntry {
  candidateId: string;
  responseOptionId: string;
}

export interface AddResponsesInput {
  eventId: string;
  userId: string;
  /** 1ユーザーの複数候補への回答。(candidateId, userId) で upsert される。 */
  entries: readonly ResponseEntry[];
}

export interface AddResponsesOutput {
  summary: ScheduleSummary;
}

export interface AddResponsesDeps {
  repository: ScheduleRepository;
  newId: IdGenerator;
  now: Clock;
}

/**
 * 1ユーザーの複数候補への回答を一括で upsert し、集計を1回だけ返す(ADR 0008 の「完了」)。
 * 検証は全 entries をまとめて先に行い、1件でも不正なら何も保存しない。
 */
export function makeAddResponses(
  deps: AddResponsesDeps,
): (input: AddResponsesInput) => Promise<AddResponsesOutput> {
  return async (input) => {
    const event = await deps.repository.findById(input.eventId);
    if (!event) {
      throw new Error(`event not found: ${input.eventId}`);
    }

    const candidateIds = new Set(event.candidates.map((c) => c.id));
    const optionIds = new Set(event.responseOptions.map((o) => o.id));
    const issues: string[] = [];
    for (const entry of input.entries) {
      if (!candidateIds.has(entry.candidateId)) {
        issues.push(`候補がイベントに属していません: ${entry.candidateId}`);
      }
      if (!optionIds.has(entry.responseOptionId)) {
        issues.push(
          `選択肢がイベントに属していません: ${entry.responseOptionId}`,
        );
      }
    }
    if (issues.length > 0) {
      throw new ScheduleValidationError(issues);
    }

    for (const entry of input.entries) {
      await deps.repository.upsertResponse({
        id: deps.newId(),
        eventId: event.id,
        candidateId: entry.candidateId,
        responseOptionId: entry.responseOptionId,
        userId: input.userId,
        now: deps.now(),
      });
    }

    const responses = await deps.repository.listResponses(event.id);
    return { summary: summarizeResponses(event, responses) };
  };
}
