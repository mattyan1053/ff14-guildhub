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
  /** 次の guild 内連番を払い出す(単調増加カウンタを +1 して返す=副作用あり)。削除で減らない。 */
  allocateGuildSeq(guildId: string): Promise<number>;
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
  /** イベントを削除する(候補・選択肢・回答は cascade で消える)。存在しない id は no-op。 */
  delete(eventId: string): Promise<void>;
  /** 公開メッセージの投稿先(channel)と id を紐づける。再表示で別チャンネルに投稿されたら channel も更新する。 */
  attachMessage(
    eventId: string,
    channelId: string,
    messageId: string,
  ): Promise<void>;
  /** (candidateId, userId) で upsert */
  upsertResponse(input: UpsertResponseInput): Promise<void>;
  /** 複数の (candidateId, userId) を1トランザクションで一括 upsert(全部成功か全部失敗) */
  upsertResponses(inputs: readonly UpsertResponseInput[]): Promise<void>;
  listResponses(eventId: string): Promise<Response[]>;
}
