import { describe, expect, it } from "vitest";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import { makeGetScheduleSummary } from "./getScheduleSummary.js";
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
    { id: "no", label: "不可", kind: "no", startMinute: null, position: 1 },
  ];
  return {
    id: "event-1",
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: null,
    creatorId: "creator-1",
    guildSeq: 1,
    title: "固定活動の日程",
    description: null,
    status: "open",
    candidates,
    responseOptions,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

describe("makeGetScheduleSummary", () => {
  it("存在するイベントの集計を返す", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(seededEvent());
    await repository.upsertResponse({
      id: "r1",
      eventId: "event-1",
      candidateId: "c0",
      responseOptionId: "yes",
      userId: "u1",
      now: FIXED_NOW,
    });
    const getScheduleSummary = makeGetScheduleSummary({ repository });

    const summary = await getScheduleSummary({ eventId: "event-1" });

    expect(summary).not.toBeNull();
    const c0 = summary?.candidates.find((c) => c.candidate.id === "c0");
    expect(c0?.anytimeCount).toBe(1);
  });

  it("存在しないイベントは null を返す", async () => {
    const repository = createFakeScheduleRepository();
    const getScheduleSummary = makeGetScheduleSummary({ repository });

    const summary = await getScheduleSummary({ eventId: "missing" });

    expect(summary).toBeNull();
  });
});
