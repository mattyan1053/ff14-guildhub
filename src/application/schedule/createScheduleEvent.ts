import {
  buildScheduleEvent,
  type CandidateSpec,
  type ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import {
  buildResponseOptionSpecs,
  parseTimeSlots,
} from "../../domain/schedule/validation.js";
import type { ScheduleRepository } from "./ports/scheduleRepository.js";
import type { Clock, IdGenerator } from "./ports/support.js";

/**
 * 候補ラベルと日付をペアのまま正規化する(トリム/空行除去/重複除去)。
 * normalizeCandidateLabels と同じ規則だが、対応する startsAt を保ったまま畳むため、
 * 空行や重複があっても日付が別の候補にずれない。
 */
function toCandidateSpecs(
  lines: string[],
  startsAt: (Date | null)[],
): CandidateSpec[] {
  const seen = new Set<string>();
  const specs: CandidateSpec[] = [];
  lines.forEach((line, index) => {
    const label = line.trim();
    if (label === "" || seen.has(label)) {
      return;
    }
    seen.add(label);
    specs.push({ label, startsAt: startsAt[index] ?? null });
  });
  return specs;
}

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
    const candidates = toCandidateSpecs(
      input.candidateLines,
      input.candidateStartsAt ?? [],
    );
    const timeSlots = parseTimeSlots(input.timeSlotLines);
    const responseOptions = buildResponseOptionSpecs(timeSlots);

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
