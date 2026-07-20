import type {
  Candidate,
  EventStatus,
  Response,
  ResponseOption,
  ResponseOptionKind,
  ScheduleEvent,
} from "../../../domain/schedule/scheduleEvent.js";
import type { DatabaseSchema } from "../../database/connection.js";

type EventRow = DatabaseSchema["events"];
type CandidateRow = DatabaseSchema["candidates"];
type ResponseOptionRow = DatabaseSchema["response_options"];
type ResponseRow = DatabaseSchema["responses"];

export function toEventRow(event: ScheduleEvent): EventRow {
  return {
    id: event.id,
    guild_id: event.guildId,
    channel_id: event.channelId,
    message_id: event.messageId,
    creator_id: event.creatorId,
    guild_seq: event.guildSeq,
    title: event.title,
    description: event.description,
    status: event.status,
    created_at: event.createdAt.toISOString(),
    updated_at: event.updatedAt.toISOString(),
  };
}

export function toCandidateRows(event: ScheduleEvent): CandidateRow[] {
  const createdAt = event.createdAt.toISOString();
  return event.candidates.map((candidate) => ({
    id: candidate.id,
    event_id: event.id,
    label: candidate.label,
    starts_at: candidate.startsAt?.toISOString() ?? null,
    position: candidate.position,
    created_at: createdAt,
  }));
}

export function toResponseOptionRows(
  event: ScheduleEvent,
): ResponseOptionRow[] {
  const createdAt = event.createdAt.toISOString();
  return event.responseOptions.map((option) => ({
    id: option.id,
    event_id: event.id,
    label: option.label,
    kind: option.kind,
    start_minute: option.startMinute,
    position: option.position,
    created_at: createdAt,
  }));
}

export function toDomainCandidate(row: CandidateRow): Candidate {
  return {
    id: row.id,
    label: row.label,
    startsAt: row.starts_at === null ? null : new Date(row.starts_at),
    position: row.position,
  };
}

export function toDomainResponseOption(row: ResponseOptionRow): ResponseOption {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind as ResponseOptionKind,
    startMinute: row.start_minute,
    position: row.position,
  };
}

export function toDomainEvent(
  row: EventRow,
  candidates: CandidateRow[],
  options: ResponseOptionRow[],
): ScheduleEvent {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    creatorId: row.creator_id,
    guildSeq: row.guild_seq,
    title: row.title,
    description: row.description,
    status: row.status as EventStatus,
    candidates: candidates.map(toDomainCandidate),
    responseOptions: options.map(toDomainResponseOption),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function toDomainResponse(row: ResponseRow): Response {
  return {
    candidateId: row.candidate_id,
    responseOptionId: row.response_option_id,
    userId: row.user_id,
  };
}
