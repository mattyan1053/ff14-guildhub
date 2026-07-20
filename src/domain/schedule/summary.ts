import type {
  Candidate,
  Response,
  ResponseOptionKind,
  ScheduleEvent,
} from "./scheduleEvent.js";

export interface OptionTally {
  readonly responseOptionId: string;
  readonly label: string;
  readonly kind: ResponseOptionKind;
  readonly count: number;
  readonly respondentIds: readonly string[];
}

export interface StartTimeTally {
  readonly responseOptionId: string;
  readonly label: string;
  readonly startMinute: number;
  readonly attendableCount: number;
}

export interface CandidateSummary {
  readonly candidate: Candidate;
  /** event.responseOptions の順で全件(0件でも列挙) */
  readonly optionTallies: readonly OptionTally[];
  /** kind==="time" の選択肢を startMinute 昇順で */
  readonly startTimes: readonly StartTimeTally[];
  readonly anytimeCount: number;
  readonly maybeCount: number;
  readonly unavailableCount: number;
}

export interface ScheduleSummary {
  readonly event: ScheduleEvent;
  /** candidate は position 昇順 */
  readonly candidates: readonly CandidateSummary[];
}

interface TimeOption {
  readonly responseOptionId: string;
  readonly label: string;
  readonly startMinute: number;
  readonly count: number;
}

function summarizeCandidate(
  candidate: Candidate,
  event: ScheduleEvent,
  responses: readonly Response[],
): CandidateSummary {
  const forCandidate = responses.filter(
    (response) => response.candidateId === candidate.id,
  );

  const optionTallies: OptionTally[] = event.responseOptions.map((option) => {
    const respondentIds = forCandidate
      .filter((response) => response.responseOptionId === option.id)
      .map((response) => response.userId);
    return {
      responseOptionId: option.id,
      label: option.label,
      kind: option.kind,
      count: respondentIds.length,
      respondentIds,
    };
  });

  const countByOptionId = new Map(
    optionTallies.map((tally) => [tally.responseOptionId, tally.count]),
  );
  const countByKind = (kind: ResponseOptionKind): number =>
    optionTallies
      .filter((tally) => tally.kind === kind)
      .reduce((sum, tally) => sum + tally.count, 0);

  const anytimeCount = countByKind("yes");

  const timeOptions: TimeOption[] = event.responseOptions
    .filter((option) => option.kind === "time" && option.startMinute !== null)
    .map((option) => ({
      responseOptionId: option.id,
      label: option.label,
      startMinute: option.startMinute as number,
      count: countByOptionId.get(option.id) ?? 0,
    }))
    .sort((a, b) => a.startMinute - b.startMinute);

  const startTimes: StartTimeTally[] = timeOptions.map((option) => ({
    responseOptionId: option.responseOptionId,
    label: option.label,
    startMinute: option.startMinute,
    attendableCount:
      anytimeCount +
      timeOptions
        .filter((other) => other.startMinute <= option.startMinute)
        .reduce((sum, other) => sum + other.count, 0),
  }));

  return {
    candidate,
    optionTallies,
    startTimes,
    anytimeCount,
    maybeCount: countByKind("maybe"),
    unavailableCount: countByKind("no"),
  };
}

/**
 * 回答を候補日ごとに集計する。
 * attendableCount = anytimeCount + (startMinute <= t.startMinute を満たす time 選択肢の件数)。
 */
export function summarizeResponses(
  event: ScheduleEvent,
  responses: readonly Response[],
): ScheduleSummary {
  const candidateIds = new Set(event.candidates.map((c) => c.id));
  const optionIds = new Set(event.responseOptions.map((o) => o.id));
  const valid = responses.filter(
    (response) =>
      candidateIds.has(response.candidateId) &&
      optionIds.has(response.responseOptionId),
  );

  const candidates = [...event.candidates]
    .sort((a, b) => a.position - b.position)
    .map((candidate) => summarizeCandidate(candidate, event, valid));

  return { event, candidates };
}
