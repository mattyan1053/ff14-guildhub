import { describe, expect, it } from "vitest";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import { makeGetScheduleEventByNumber } from "./getScheduleEventByNumber.js";
import { createFakeScheduleRepository } from "./testing/fakeScheduleRepository.js";

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");

function seededEvent(): ScheduleEvent {
  const candidates: Candidate[] = [
    { id: "c0", label: "7/25(金)", startsAt: null, position: 0 },
  ];
  const responseOptions: ResponseOption[] = [
    {
      id: "yes",
      label: "いつでも",
      kind: "yes",
      startMinute: null,
      position: 0,
    },
  ];
  return {
    id: "event-1",
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: "message-1",
    creatorId: "creator-1",
    guildSeq: 2,
    title: "固定活動の日程",
    description: null,
    status: "open",
    candidates,
    responseOptions,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

describe("makeGetScheduleEventByNumber", () => {
  it("guild 内連番でイベントを引き、そのまま ScheduleEvent を返す", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(seededEvent());
    const getScheduleEventByNumber = makeGetScheduleEventByNumber({
      repository,
    });

    const event = await getScheduleEventByNumber({
      guildId: "guild-1",
      guildSeq: 2,
    });

    expect(event).not.toBeNull();
    expect(event?.id).toBe("event-1");
    // 権限判定・確認表示に使うため creatorId / messageId をそのまま持つ
    expect(event?.creatorId).toBe("creator-1");
    expect(event?.messageId).toBe("message-1");
  });

  it("該当連番が無ければ null を返す", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(seededEvent());
    const getScheduleEventByNumber = makeGetScheduleEventByNumber({
      repository,
    });

    expect(
      await getScheduleEventByNumber({ guildId: "guild-1", guildSeq: 99 }),
    ).toBeNull();
  });

  it("別 guild の同一連番は引かない", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(seededEvent());
    const getScheduleEventByNumber = makeGetScheduleEventByNumber({
      repository,
    });

    expect(
      await getScheduleEventByNumber({ guildId: "guild-2", guildSeq: 2 }),
    ).toBeNull();
  });
});
