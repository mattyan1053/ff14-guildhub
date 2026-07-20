import type {
  Response,
  ScheduleEvent,
} from "../../../domain/schedule/scheduleEvent.js";

export interface UpsertResponseInput {
  readonly id: string;
  readonly eventId: string;
  readonly candidateId: string;
  readonly responseOptionId: string;
  readonly userId: string;
  readonly now: Date;
}

export interface ScheduleRepository {
  /** 次の guild 内連番 */
  nextGuildSeq(guildId: string): Promise<number>;
  /** event + candidates + response_options を一括永続化 */
  create(event: ScheduleEvent): Promise<void>;
  findById(eventId: string): Promise<ScheduleEvent | null>;
  setMessageId(eventId: string, messageId: string): Promise<void>;
  /** (candidateId, userId) で upsert */
  upsertResponse(input: UpsertResponseInput): Promise<void>;
  listResponses(eventId: string): Promise<Response[]>;
}
