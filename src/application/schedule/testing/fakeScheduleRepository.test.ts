import { describe, expect, it } from "vitest";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../../domain/schedule/scheduleEvent.js";
import { createFakeScheduleRepository } from "./fakeScheduleRepository.js";

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");

function event(id: string, guildId: string, guildSeq: number): ScheduleEvent {
  const candidates: Candidate[] = [
    { id: `${id}-c0`, label: "7/25", startsAt: null, position: 0 },
  ];
  const responseOptions: ResponseOption[] = [
    {
      id: `${id}-yes`,
      label: "いつでも",
      kind: "yes",
      startMinute: null,
      position: 0,
    },
  ];
  return {
    id,
    guildId,
    channelId: "channel-1",
    messageId: null,
    creatorId: "creator-1",
    guildSeq,
    title: "t",
    description: null,
    status: "open",
    candidates,
    responseOptions,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

describe("createFakeScheduleRepository", () => {
  it("nextGuildSeq は guild ごとに1起点で最大+1を返す", async () => {
    const repo = createFakeScheduleRepository();

    expect(await repo.nextGuildSeq("g1")).toBe(1);
    await repo.create(event("e1", "g1", 1));
    expect(await repo.nextGuildSeq("g1")).toBe(2);
    expect(await repo.nextGuildSeq("g2")).toBe(1);
  });

  it("create したイベントを findById で取得できる", async () => {
    const repo = createFakeScheduleRepository();
    await repo.create(event("e1", "g1", 1));

    expect((await repo.findById("e1"))?.id).toBe("e1");
    expect(await repo.findById("missing")).toBeNull();
  });

  it("setMessageId で messageId を更新する", async () => {
    const repo = createFakeScheduleRepository();
    await repo.create(event("e1", "g1", 1));

    await repo.setMessageId("e1", "m1");

    expect((await repo.findById("e1"))?.messageId).toBe("m1");
  });

  it("upsertResponse は (candidateId, userId) で置換する", async () => {
    const repo = createFakeScheduleRepository();
    await repo.create(event("e1", "g1", 1));

    await repo.upsertResponse({
      id: "r1",
      eventId: "e1",
      candidateId: "c0",
      responseOptionId: "yes",
      userId: "u1",
      now: FIXED_NOW,
    });
    await repo.upsertResponse({
      id: "r2",
      eventId: "e1",
      candidateId: "c0",
      responseOptionId: "no",
      userId: "u1",
      now: FIXED_NOW,
    });

    const responses = await repo.listResponses("e1");
    expect(responses).toHaveLength(1);
    expect(responses[0]?.responseOptionId).toBe("no");
  });

  it("upsertResponses は複数を一括保存する", async () => {
    const repo = createFakeScheduleRepository();
    await repo.create(event("e1", "g1", 1));

    await repo.upsertResponses([
      {
        id: "r1",
        eventId: "e1",
        candidateId: "c0",
        responseOptionId: "yes",
        userId: "u1",
        now: FIXED_NOW,
      },
      {
        id: "r2",
        eventId: "e1",
        candidateId: "c1",
        responseOptionId: "no",
        userId: "u1",
        now: FIXED_NOW,
      },
    ]);

    const responses = await repo.listResponses("e1");
    expect(responses).toHaveLength(2);
  });

  it("listResponses は挿入順を保つ", async () => {
    const repo = createFakeScheduleRepository();
    await repo.create(event("e1", "g1", 1));

    await repo.upsertResponse({
      id: "r1",
      eventId: "e1",
      candidateId: "c0",
      responseOptionId: "yes",
      userId: "u2",
      now: FIXED_NOW,
    });
    await repo.upsertResponse({
      id: "r2",
      eventId: "e1",
      candidateId: "c0",
      responseOptionId: "yes",
      userId: "u1",
      now: FIXED_NOW,
    });

    const responses = await repo.listResponses("e1");
    expect(responses.map((r) => r.userId)).toEqual(["u2", "u1"]);
  });
});
