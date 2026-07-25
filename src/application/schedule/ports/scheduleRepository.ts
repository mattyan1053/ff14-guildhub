import type {
  EventStatus,
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

/** 一覧表示用の軽量な読み取りモデル */
export interface ScheduleEventListItem {
  readonly id: string;
  readonly guildSeq: number;
  readonly title: string;
  readonly status: EventStatus;
}

export interface ScheduleRepository {
  /** 次の guild 内連番 */
  nextGuildSeq(guildId: string): Promise<number>;
  /** event + candidates + response_options を一括永続化 */
  create(event: ScheduleEvent): Promise<void>;
  findById(eventId: string): Promise<ScheduleEvent | null>;
  /** guild 内連番でイベントを引く(/schedule show 用) */
  findByGuildSeq(
    guildId: string,
    guildSeq: number,
  ): Promise<ScheduleEvent | null>;
  /** guild のイベントを連番の降順で一覧する(/schedule list 用) */
  listByGuild(guildId: string): Promise<ScheduleEventListItem[]>;
  setMessageId(eventId: string, messageId: string): Promise<void>;
  /** (candidateId, userId) で upsert */
  upsertResponse(input: UpsertResponseInput): Promise<void>;
  /** 複数の (candidateId, userId) を1トランザクションで一括 upsert(全部成功か全部失敗) */
  upsertResponses(inputs: readonly UpsertResponseInput[]): Promise<void>;
  listResponses(eventId: string): Promise<Response[]>;
}
