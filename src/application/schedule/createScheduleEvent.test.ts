import { describe, expect, it } from "vitest";
import { ScheduleValidationError } from "../../domain/schedule/errors.js";
import {
  type CreateScheduleEventInput,
  makeCreateScheduleEvent,
} from "./createScheduleEvent.js";
import { createFakeScheduleRepository } from "./testing/fakeScheduleRepository.js";

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");

function sequentialIds(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
}

function input(
  overrides: Partial<CreateScheduleEventInput> = {},
): CreateScheduleEventInput {
  return {
    guildId: "guild-1",
    channelId: "channel-1",
    creatorId: "creator-1",
    title: "固定活動の日程",
    description: null,
    candidateLines: ["7/25(金)", "7/26(土)"],
    timeSlotLines: ["21:00", "22:00"],
    ...overrides,
  };
}

describe("makeCreateScheduleEvent", () => {
  it("候補・状態集合を組み立てて永続化する", async () => {
    const repository = createFakeScheduleRepository();
    const createScheduleEvent = makeCreateScheduleEvent({
      repository,
      newId: sequentialIds(),
      now: () => FIXED_NOW,
    });

    const { event } = await createScheduleEvent(input());

    expect(event.candidates.map((c) => c.label)).toEqual([
      "7/25(金)",
      "7/26(土)",
    ]);
    expect(event.responseOptions.map((o) => o.label)).toEqual([
      "いつでも",
      "21:00〜",
      "22:00〜",
      "未定",
      "不可",
    ]);
    expect(event.responseOptions.map((o) => o.kind)).toEqual([
      "yes",
      "time",
      "time",
      "maybe",
      "no",
    ]);
    expect(event.status).toBe("open");
    expect(event.candidates.map((c) => c.position)).toEqual([0, 1]);
  });

  it("永続化された event は findById で取得できる", async () => {
    const repository = createFakeScheduleRepository();
    const createScheduleEvent = makeCreateScheduleEvent({
      repository,
      newId: sequentialIds(),
      now: () => FIXED_NOW,
    });

    const { event } = await createScheduleEvent(input());
    const stored = await repository.findById(event.id);

    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(event.id);
  });

  it("guild 内連番を採番する(同一 guild で 1, 2 と増える)", async () => {
    const repository = createFakeScheduleRepository();
    const createScheduleEvent = makeCreateScheduleEvent({
      repository,
      newId: sequentialIds(),
      now: () => FIXED_NOW,
    });

    const first = await createScheduleEvent(input());
    const second = await createScheduleEvent(input());

    expect(first.event.guildSeq).toBe(1);
    expect(second.event.guildSeq).toBe(2);
  });

  it("末尾を削除してから作り直しても番号を再利用しない", async () => {
    const repository = createFakeScheduleRepository();
    const createScheduleEvent = makeCreateScheduleEvent({
      repository,
      newId: sequentialIds(),
      now: () => FIXED_NOW,
    });

    const first = await createScheduleEvent(input()); // #1
    const second = await createScheduleEvent(input()); // #2
    const third = await createScheduleEvent(input()); // #3

    // 末尾 #3 を削除
    await repository.delete(third.event.id);

    const fourth = await createScheduleEvent(input()); // #3 ではなく #4

    expect([first, second, third].map((r) => r.event.guildSeq)).toEqual([
      1, 2, 3,
    ]);
    expect(fourth.event.guildSeq).toBe(4);
  });

  it("タイトルが空だと ScheduleValidationError を伝播する", async () => {
    const repository = createFakeScheduleRepository();
    const createScheduleEvent = makeCreateScheduleEvent({
      repository,
      newId: sequentialIds(),
      now: () => FIXED_NOW,
    });

    await expect(createScheduleEvent(input({ title: "   " }))).rejects.toThrow(
      ScheduleValidationError,
    );
  });

  it("候補が0件だと ScheduleValidationError を伝播する", async () => {
    const repository = createFakeScheduleRepository();
    const createScheduleEvent = makeCreateScheduleEvent({
      repository,
      newId: sequentialIds(),
      now: () => FIXED_NOW,
    });

    await expect(
      createScheduleEvent(input({ candidateLines: ["", "  "] })),
    ).rejects.toThrow(ScheduleValidationError);
  });

  it("時刻0件でも いつでも/未定/不可 の3状態で作成できる", async () => {
    const repository = createFakeScheduleRepository();
    const createScheduleEvent = makeCreateScheduleEvent({
      repository,
      newId: sequentialIds(),
      now: () => FIXED_NOW,
    });

    const { event } = await createScheduleEvent(input({ timeSlotLines: [] }));

    expect(event.responseOptions.map((o) => o.kind)).toEqual([
      "yes",
      "maybe",
      "no",
    ]);
  });

  it("空行や重複があっても candidateStartsAt が正しい候補に対応する", async () => {
    const repository = createFakeScheduleRepository();
    const createScheduleEvent = makeCreateScheduleEvent({
      repository,
      newId: sequentialIds(),
      now: () => FIXED_NOW,
    });
    const d25 = new Date("2026-07-25T12:00:00.000Z");
    const d26 = new Date("2026-07-26T12:00:00.000Z");

    const { event } = await createScheduleEvent(
      input({
        candidateLines: ["7/25", "", "7/26"],
        candidateStartsAt: [d25, null, d26],
      }),
    );

    expect(event.candidates.map((c) => c.label)).toEqual(["7/25", "7/26"]);
    expect(event.candidates[0]?.startsAt).toEqual(d25);
    expect(event.candidates[1]?.startsAt).toEqual(d26);
  });
});
