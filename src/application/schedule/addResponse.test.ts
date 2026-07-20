import { describe, expect, it } from "vitest";
import { ScheduleValidationError } from "../../domain/schedule/errors.js";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import { makeAddResponse } from "./addResponse.js";
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
  const addResponse = makeAddResponse({
    repository,
    newId: sequentialIds(),
    now: () => FIXED_NOW,
  });
  return { repository, addResponse };
}

describe("makeAddResponse", () => {
  it("初回回答を保存し集計を返す", async () => {
    const { addResponse } = setup();

    const { summary } = await addResponse({
      eventId: "event-1",
      candidateId: "c0",
      responseOptionId: "yes",
      userId: "u1",
    });

    const c0 = summary.candidates.find((c) => c.candidate.id === "c0");
    expect(c0?.anytimeCount).toBe(1);
    const yes = c0?.optionTallies.find((t) => t.responseOptionId === "yes");
    expect(yes?.count).toBe(1);
    expect(yes?.respondentIds).toEqual(["u1"]);
  });

  it("同一(候補,ユーザー)の再回答は置き換えで二重計上しない", async () => {
    const { addResponse } = setup();

    await addResponse({
      eventId: "event-1",
      candidateId: "c0",
      responseOptionId: "yes",
      userId: "u1",
    });
    const { summary } = await addResponse({
      eventId: "event-1",
      candidateId: "c0",
      responseOptionId: "t21",
      userId: "u1",
    });

    const c0 = summary.candidates.find((c) => c.candidate.id === "c0");
    const yes = c0?.optionTallies.find((t) => t.responseOptionId === "yes");
    const t21 = c0?.optionTallies.find((t) => t.responseOptionId === "t21");
    expect(yes?.count).toBe(0);
    expect(t21?.count).toBe(1);
    expect(c0?.anytimeCount).toBe(0);
  });

  it("存在しないイベントはエラー", async () => {
    const { addResponse } = setup();

    await expect(
      addResponse({
        eventId: "missing",
        candidateId: "c0",
        responseOptionId: "yes",
        userId: "u1",
      }),
    ).rejects.toThrow();
  });

  it("イベントに属さない候補IDは ScheduleValidationError", async () => {
    const { addResponse } = setup();

    await expect(
      addResponse({
        eventId: "event-1",
        candidateId: "ghost",
        responseOptionId: "yes",
        userId: "u1",
      }),
    ).rejects.toThrow(ScheduleValidationError);
  });

  it("イベントに属さない選択肢IDは ScheduleValidationError", async () => {
    const { addResponse } = setup();

    await expect(
      addResponse({
        eventId: "event-1",
        candidateId: "c0",
        responseOptionId: "ghost",
        userId: "u1",
      }),
    ).rejects.toThrow(ScheduleValidationError);
  });
});
