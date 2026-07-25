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
  describe("allocateGuildSeq", () => {
    it("空の guild では最初の払い出しが 1", async () => {
      const repo = createFakeScheduleRepository();

      expect(await repo.allocateGuildSeq("g1")).toBe(1);
    });

    it("連続して払い出すと 1, 2, 3 と単調増加し同値を返さない", async () => {
      const repo = createFakeScheduleRepository();

      expect(await repo.allocateGuildSeq("g1")).toBe(1);
      expect(await repo.allocateGuildSeq("g1")).toBe(2);
      expect(await repo.allocateGuildSeq("g1")).toBe(3);
    });

    it("guild ごとに独立して採番する", async () => {
      const repo = createFakeScheduleRepository();

      expect(await repo.allocateGuildSeq("g1")).toBe(1);
      expect(await repo.allocateGuildSeq("g1")).toBe(2);
      expect(await repo.allocateGuildSeq("g2")).toBe(1);
    });

    it("seed した番号ぶんカウンタを底上げする(backfill 相当)", async () => {
      const repo = createFakeScheduleRepository();
      repo.seed(event("e1", "g1", 1));
      repo.seed(event("e2", "g1", 2));
      repo.seed(event("e3", "g1", 3));

      expect(await repo.allocateGuildSeq("g1")).toBe(4);
    });

    it("create した番号ぶんカウンタを底上げする", async () => {
      const repo = createFakeScheduleRepository();
      await repo.create(event("e1", "g1", 1));
      await repo.create(event("e2", "g1", 2));

      expect(await repo.allocateGuildSeq("g1")).toBe(3);
    });

    it("末尾を delete しても番号を再利用しない", async () => {
      const repo = createFakeScheduleRepository();
      await repo.create(event("e1", "g1", 1));
      await repo.create(event("e2", "g1", 2));
      await repo.create(event("e3", "g1", 3));

      await repo.delete("e3");

      // #3 は消えたが再利用されず、次の払い出しは #4。3 は二度と出ない。
      expect(await repo.allocateGuildSeq("g1")).toBe(4);
    });
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

  it("delete はイベントを除去し findById / allEvents に反映する", async () => {
    const repo = createFakeScheduleRepository();
    await repo.create(event("e1", "g1", 1));
    await repo.create(event("e2", "g1", 2));

    await repo.delete("e1");

    expect(await repo.findById("e1")).toBeNull();
    expect(repo.allEvents().map((e) => e.id)).toEqual(["e2"]);
  });

  it("delete はそのイベントの responses も cascade 相当で除去する", async () => {
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

    await repo.delete("e1");

    expect(await repo.listResponses("e1")).toHaveLength(0);
  });

  it("存在しない id の delete は no-op(例外を投げない)", async () => {
    const repo = createFakeScheduleRepository();
    await repo.create(event("e1", "g1", 1));

    await expect(repo.delete("missing")).resolves.toBeUndefined();
    expect(await repo.findById("e1")).not.toBeNull();
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
