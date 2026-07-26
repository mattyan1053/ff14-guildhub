import type {
  Response,
  ScheduleEvent,
} from "../../../domain/schedule/scheduleEvent.js";
import type {
  ScheduleEventListItem,
  ScheduleRepository,
  UpsertResponseInput,
} from "../ports/scheduleRepository.js";

export interface FakeScheduleRepository extends ScheduleRepository {
  /** テスト用: 保存済みイベントを直接参照する */
  seed(event: ScheduleEvent): void;
  /** テスト用: 保存済みイベント一覧 */
  allEvents(): ScheduleEvent[];
  /**
   * guild 内の open なイベントのうち、starts_at が一致する候補日を持つものを返す。
   * ScheduleRepository ポートへ追加予定のメソッド(追加後この宣言は冗長になるが無害)。
   */
  listOpenEventsByCandidateDate(
    guildId: string,
    startsAt: Date,
  ): Promise<ScheduleEvent[]>;
}

/**
 * Map ベースのインメモリ ScheduleRepository。テストから注入して使う。
 */
export function createFakeScheduleRepository(): FakeScheduleRepository {
  const events = new Map<string, ScheduleEvent>();
  const responsesByEvent = new Map<string, Response[]>();
  // guild ごとの採番カウンタ。実装(migration バックフィル + guild_counters)を模す。
  const counters = new Map<string, number>();

  function put(event: ScheduleEvent): void {
    events.set(event.id, event);
    if (!responsesByEvent.has(event.id)) {
      responsesByEvent.set(event.id, []);
    }
    // seed / create された番号ぶんカウンタを底上げする(バックフィル相当)。
    const current = counters.get(event.guildId) ?? 0;
    counters.set(event.guildId, Math.max(current, event.guildSeq));
  }

  function doUpsert(input: UpsertResponseInput): void {
    const list = responsesByEvent.get(input.eventId) ?? [];
    const next: Response = {
      candidateId: input.candidateId,
      responseOptionId: input.responseOptionId,
      userId: input.userId,
    };
    const index = list.findIndex(
      (r) => r.candidateId === input.candidateId && r.userId === input.userId,
    );
    if (index >= 0) {
      list[index] = next;
    } else {
      list.push(next);
    }
    responsesByEvent.set(input.eventId, list);
  }

  return {
    allocateGuildSeq(guildId: string): Promise<number> {
      // 単調増加カウンタを +1 して払い出す。delete では減らない(再利用しない)。
      const next = (counters.get(guildId) ?? 0) + 1;
      counters.set(guildId, next);
      return Promise.resolve(next);
    },

    create(event: ScheduleEvent): Promise<void> {
      put(event);
      return Promise.resolve();
    },

    findById(eventId: string): Promise<ScheduleEvent | null> {
      return Promise.resolve(events.get(eventId) ?? null);
    },

    findByGuildSeq(
      guildId: string,
      guildSeq: number,
    ): Promise<ScheduleEvent | null> {
      for (const event of events.values()) {
        if (event.guildId === guildId && event.guildSeq === guildSeq) {
          return Promise.resolve(event);
        }
      }
      return Promise.resolve(null);
    },

    listByGuild(guildId: string): Promise<ScheduleEventListItem[]> {
      const items = [...events.values()]
        .filter((event) => event.guildId === guildId)
        .sort((a, b) => b.guildSeq - a.guildSeq)
        .map((event) => ({
          id: event.id,
          guildSeq: event.guildSeq,
          title: event.title,
          status: event.status,
        }));
      return Promise.resolve(items);
    },

    delete(eventId: string): Promise<void> {
      events.delete(eventId);
      responsesByEvent.delete(eventId);
      return Promise.resolve();
    },

    attachMessage(
      eventId: string,
      channelId: string,
      messageId: string,
    ): Promise<void> {
      const event = events.get(eventId);
      if (!event) {
        throw new Error(`event not found: ${eventId}`);
      }
      events.set(eventId, { ...event, channelId, messageId });
      return Promise.resolve();
    },

    upsertResponse(input: UpsertResponseInput): Promise<void> {
      doUpsert(input);
      return Promise.resolve();
    },

    upsertResponses(inputs: readonly UpsertResponseInput[]): Promise<void> {
      for (const input of inputs) {
        doUpsert(input);
      }
      return Promise.resolve();
    },

    listResponses(eventId: string): Promise<Response[]> {
      return Promise.resolve([...(responsesByEvent.get(eventId) ?? [])]);
    },

    listOpenEventsByCandidateDate(
      guildId: string,
      startsAt: Date,
    ): Promise<ScheduleEvent[]> {
      const time = startsAt.getTime();
      const matched = [...events.values()].filter(
        (event) =>
          event.guildId === guildId &&
          event.status === "open" &&
          event.candidates.some(
            (candidate) => candidate.startsAt?.getTime() === time,
          ),
      );
      return Promise.resolve(matched);
    },

    seed(event: ScheduleEvent): void {
      put(event);
    },

    allEvents(): ScheduleEvent[] {
      return [...events.values()];
    },
  };
}
