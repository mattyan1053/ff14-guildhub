import { describe, expect, it } from "vitest";
import type { ScheduleEvent } from "../../domain/schedule/scheduleEvent.js";
import { makeListScheduleEvents } from "./listScheduleEvents.js";
import { createFakeScheduleRepository } from "./testing/fakeScheduleRepository.js";

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");

function event(
  id: string,
  guildSeq: number,
  title: string,
  guildId = "guild-1",
): ScheduleEvent {
  return {
    id,
    guildId,
    channelId: "channel-1",
    messageId: null,
    creatorId: "creator-1",
    guildSeq,
    title,
    description: null,
    status: "open",
    candidates: [],
    responseOptions: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

describe("makeListScheduleEvents", () => {
  it("guild のイベントを連番の降順で一覧する", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(event("e1", 1, "1回目"));
    repository.seed(event("e2", 2, "2回目"));
    repository.seed(event("e3", 3, "3回目"));
    const listScheduleEvents = makeListScheduleEvents({ repository });

    const items = await listScheduleEvents({ guildId: "guild-1" });

    expect(items.map((i) => i.guildSeq)).toEqual([3, 2, 1]);
    expect(items[0]?.title).toBe("3回目");
  });

  it("別 guild のイベントは含めない", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(event("e1", 1, "自分", "guild-1"));
    repository.seed(event("e2", 1, "他所", "guild-2"));
    const listScheduleEvents = makeListScheduleEvents({ repository });

    const items = await listScheduleEvents({ guildId: "guild-1" });

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("自分");
  });
});
