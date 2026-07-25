import { describe, expect, it } from "vitest";
import { ScheduleValidationError } from "../../domain/schedule/errors.js";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import { makeAddResponses } from "./addResponses.js";
import { createFakeScheduleRepository } from "./testing/fakeScheduleRepository.js";

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");

function sequentialIds(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `resp-${n}`;
  };
}

function seededEvent(): ScheduleEvent {
  const candidates: Candidate[] = [
    { id: "c0", label: "7/25(金)", startsAt: null, position: 0 },
    { id: "c1", label: "7/26(土)", startsAt: null, position: 1 },
    { id: "c2", label: "7/27(日)", startsAt: null, position: 2 },
  ];
  const responseOptions: ResponseOption[] = [
    {
      id: "yes",
      label: "いつでも",
      kind: "yes",
      startMinute: null,
      position: 0,
    },
    {
      id: "t21",
      label: "21:00〜",
      kind: "time",
      startMinute: 1260,
      position: 1,
    },
    {
      id: "maybe",
      label: "未定",
      kind: "maybe",
      startMinute: null,
      position: 2,
    },
    { id: "no", label: "不可", kind: "no", startMinute: null, position: 3 },
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

function setup() {
  const repository = createFakeScheduleRepository();
  repository.seed(seededEvent());
  const addResponses = makeAddResponses({
    repository,
    newId: sequentialIds(),
    now: () => FIXED_NOW,
  });
  return { repository, addResponses };
}

describe("makeAddResponses", () => {
  it("複数候補の回答を一括保存し、集計を1回で返す", async () => {
    const { addResponses } = setup();

    const { summary } = await addResponses({
      eventId: "event-1",
      userId: "u1",
      entries: [
        { candidateId: "c0", responseOptionId: "no" },
        { candidateId: "c1", responseOptionId: "t21" },
        { candidateId: "c2", responseOptionId: "yes" },
      ],
    });

    const c0 = summary.candidates.find((c) => c.candidate.id === "c0");
    const c1 = summary.candidates.find((c) => c.candidate.id === "c1");
    const c2 = summary.candidates.find((c) => c.candidate.id === "c2");
    expect(c0?.unavailableCount).toBe(1);
    expect(
      c1?.optionTallies.find((t) => t.responseOptionId === "t21")?.count,
    ).toBe(1);
    expect(c2?.anytimeCount).toBe(1);
  });

  it("同一(候補,ユーザー)の再回答は置き換えで二重計上しない", async () => {
    const { addResponses } = setup();

    await addResponses({
      eventId: "event-1",
      userId: "u1",
      entries: [{ candidateId: "c0", responseOptionId: "yes" }],
    });
    const { summary } = await addResponses({
      eventId: "event-1",
      userId: "u1",
      entries: [{ candidateId: "c0", responseOptionId: "no" }],
    });

    const c0 = summary.candidates.find((c) => c.candidate.id === "c0");
    expect(c0?.anytimeCount).toBe(0);
    expect(c0?.unavailableCount).toBe(1);
  });

  it("entries が空でも集計を返す(何も変更しない)", async () => {
    const { addResponses } = setup();

    const { summary } = await addResponses({
      eventId: "event-1",
      userId: "u1",
      entries: [],
    });

    expect(summary.candidates).toHaveLength(3);
    expect(
      summary.candidates.every(
        (c) => c.anytimeCount + c.maybeCount + c.unavailableCount === 0,
      ),
    ).toBe(true);
  });

  it("存在しないイベントはエラー", async () => {
    const { addResponses } = setup();

    await expect(
      addResponses({
        eventId: "missing",
        userId: "u1",
        entries: [{ candidateId: "c0", responseOptionId: "yes" }],
      }),
    ).rejects.toThrow();
  });

  it("イベントに属さない候補IDがあれば ScheduleValidationError(1件も保存しない)", async () => {
    const { repository, addResponses } = setup();

    await expect(
      addResponses({
        eventId: "event-1",
        userId: "u1",
        entries: [
          { candidateId: "c0", responseOptionId: "yes" },
          { candidateId: "ghost", responseOptionId: "no" },
        ],
      }),
    ).rejects.toThrow(ScheduleValidationError);

    // 検証で弾いたので何も保存されていない
    const responses = await repository.listResponses("event-1");
    expect(responses).toHaveLength(0);
  });

  it("イベントに属さない選択肢IDがあれば ScheduleValidationError(1件も保存しない)", async () => {
    const { repository, addResponses } = setup();

    await expect(
      addResponses({
        eventId: "event-1",
        userId: "u1",
        entries: [{ candidateId: "c0", responseOptionId: "ghost" }],
      }),
    ).rejects.toThrow(ScheduleValidationError);

    const responses = await repository.listResponses("event-1");
    expect(responses).toHaveLength(0);
  });
});
