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
}

/**
 * Map ベースのインメモリ ScheduleRepository。テストから注入して使う。
 */
export function createFakeScheduleRepository(): FakeScheduleRepository {
  const events = new Map<string, ScheduleEvent>();
  const responsesByEvent = new Map<string, Response[]>();

  function put(event: ScheduleEvent): void {
    events.set(event.id, event);
    if (!responsesByEvent.has(event.id)) {
      responsesByEvent.set(event.id, []);
    }
  }

  return {
    nextGuildSeq(guildId: string): Promise<number> {
      let max = 0;
      for (const event of events.values()) {
        if (event.guildId === guildId && event.guildSeq > max) {
          max = event.guildSeq;
        }
      }
      return Promise.resolve(max + 1);
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

    setMessageId(eventId: string, messageId: string): Promise<void> {
      const event = events.get(eventId);
      if (!event) {
        throw new Error(`event not found: ${eventId}`);
      }
      events.set(eventId, { ...event, messageId });
      return Promise.resolve();
    },

    upsertResponse(input: UpsertResponseInput): Promise<void> {
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
      return Promise.resolve();
    },

    listResponses(eventId: string): Promise<Response[]> {
      return Promise.resolve([...(responsesByEvent.get(eventId) ?? [])]);
    },

    seed(event: ScheduleEvent): void {
      put(event);
    },

    allEvents(): ScheduleEvent[] {
      return [...events.values()];
    },
  };
}
