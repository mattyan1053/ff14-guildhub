import { ScheduleValidationError } from "./errors.js";
import { MAX_CANDIDATES, MAX_LABEL_LENGTH } from "./limits.js";

export type ResponseOptionKind = "yes" | "time" | "maybe" | "no";

export type EventStatus = "open";

export interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly startsAt: Date | null;
  readonly position: number;
}

export interface ResponseOption {
  readonly id: string;
  readonly label: string;
  readonly kind: ResponseOptionKind;
  /** kind === "time" のときのみ非null */
  readonly startMinute: number | null;
  readonly position: number;
}

export interface Response {
  readonly candidateId: string;
  readonly responseOptionId: string;
  readonly userId: string;
}

export interface ScheduleEvent {
  readonly id: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string | null;
  readonly creatorId: string;
  readonly guildSeq: number;
  readonly title: string;
  readonly description: string | null;
  readonly status: EventStatus;
  readonly candidates: readonly Candidate[];
  readonly responseOptions: readonly ResponseOption[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CandidateSpec {
  readonly label: string;
  readonly startsAt: Date | null;
}

export interface ResponseOptionSpec {
  readonly label: string;
  readonly kind: ResponseOptionKind;
  readonly startMinute: number | null;
}

export interface BuildScheduleEventParams {
  readonly guildId: string;
  readonly channelId: string;
  readonly creatorId: string;
  readonly guildSeq: number;
  readonly title: string;
  readonly description: string | null;
  readonly candidates: readonly CandidateSpec[];
  readonly responseOptions: readonly ResponseOptionSpec[];
}

export interface BuildScheduleEventDeps {
  readonly newId: () => string;
  readonly now: () => Date;
}

function collectBuildIssues(
  params: BuildScheduleEventParams,
  title: string,
): string[] {
  const issues: string[] = [];

  if (title === "") {
    issues.push("タイトルが空です");
  }
  if (params.candidates.length === 0) {
    issues.push("候補が1件以上必要です");
  }
  if (params.candidates.length > MAX_CANDIDATES) {
    issues.push(`候補は最大 ${MAX_CANDIDATES} 件までです`);
  }
  if (params.responseOptions.length === 0) {
    issues.push("選択肢が1件以上必要です");
  }
  for (const candidate of params.candidates) {
    if (candidate.label.length > MAX_LABEL_LENGTH) {
      issues.push(`候補のラベルが長すぎます: ${candidate.label}`);
    }
  }
  for (const option of params.responseOptions) {
    issues.push(...collectOptionIssues(option));
  }

  return issues;
}

function collectOptionIssues(option: ResponseOptionSpec): string[] {
  const issues: string[] = [];
  if (option.label.length > MAX_LABEL_LENGTH) {
    issues.push(`選択肢のラベルが長すぎます: ${option.label}`);
  }
  if (option.kind === "time" && option.startMinute === null) {
    issues.push(`時刻の選択肢に開始時刻がありません: ${option.label}`);
  }
  if (option.kind !== "time" && option.startMinute !== null) {
    issues.push(`時刻以外の選択肢に開始時刻が付いています: ${option.label}`);
  }
  return issues;
}

/**
 * 候補/選択肢の「素の指定」を受けて ScheduleEvent 集約を組み立てる純粋関数。
 */
export function buildScheduleEvent(
  params: BuildScheduleEventParams,
  deps: BuildScheduleEventDeps,
): ScheduleEvent {
  const title = params.title.trim();
  const issues = collectBuildIssues(params, title);

  if (issues.length > 0) {
    throw new ScheduleValidationError(issues);
  }

  const id = deps.newId();
  const createdAt = deps.now();
  const candidates: Candidate[] = params.candidates.map((candidate, index) => ({
    id: deps.newId(),
    label: candidate.label,
    startsAt: candidate.startsAt,
    position: index,
  }));
  const responseOptions: ResponseOption[] = params.responseOptions.map(
    (option, index) => ({
      id: deps.newId(),
      label: option.label,
      kind: option.kind,
      startMinute: option.startMinute,
      position: index,
    }),
  );

  return {
    id,
    guildId: params.guildId,
    channelId: params.channelId,
    messageId: null,
    creatorId: params.creatorId,
    guildSeq: params.guildSeq,
    title,
    description: params.description,
    status: "open",
    candidates,
    responseOptions,
    createdAt,
    updatedAt: createdAt,
  };
}
