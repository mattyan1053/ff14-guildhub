import { describe, expect, it } from "vitest";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import { makeDeleteScheduleEvent } from "./deleteScheduleEvent.js";
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

describe("makeDeleteScheduleEvent", () => {
  it("作成者が削除すると deleted を返し、消した event を渡す", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(seededEvent());
    const deleteScheduleEvent = makeDeleteScheduleEvent({ repository });

    const result = await deleteScheduleEvent({
      eventId: "event-1",
      actor: { userId: "creator-1", hasManagePermission: false },
    });

    expect(result.outcome).toBe("deleted");
    // 呼び出し側が messageId を使って公開メッセージを消せるよう、消した event を返す
    if (result.outcome === "deleted") {
      expect(result.event.id).toBe("event-1");
      expect(result.event.messageId).toBe("message-1");
    }
  });

  it("管理権限を持てば作成者でなくても削除できる", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(seededEvent());
    const deleteScheduleEvent = makeDeleteScheduleEvent({ repository });

    const result = await deleteScheduleEvent({
      eventId: "event-1",
      actor: { userId: "someone-else", hasManagePermission: true },
    });

    expect(result.outcome).toBe("deleted");
    expect(await repository.findById("event-1")).toBeNull();
  });

  it("作成者でも管理権限でもなければ forbidden を返し、削除しない", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(seededEvent());
    const deleteScheduleEvent = makeDeleteScheduleEvent({ repository });

    const result = await deleteScheduleEvent({
      eventId: "event-1",
      actor: { userId: "someone-else", hasManagePermission: false },
    });

    expect(result.outcome).toBe("forbidden");
    // 権限が無いので消えていない
    expect(await repository.findById("event-1")).not.toBeNull();
    expect(repository.allEvents()).toHaveLength(1);
  });

  it("削除後は repository からイベントと responses が消えている", async () => {
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
    const deleteScheduleEvent = makeDeleteScheduleEvent({ repository });

    await deleteScheduleEvent({
      eventId: "event-1",
      actor: { userId: "creator-1", hasManagePermission: false },
    });

    expect(await repository.findById("event-1")).toBeNull();
    expect(repository.allEvents()).toHaveLength(0);
    expect(await repository.listResponses("event-1")).toHaveLength(0);
  });

  it("存在しない eventId は not_found を返す", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(seededEvent());
    const deleteScheduleEvent = makeDeleteScheduleEvent({ repository });

    const result = await deleteScheduleEvent({
      eventId: "missing",
      actor: { userId: "creator-1", hasManagePermission: true },
    });

    expect(result.outcome).toBe("not_found");
    // 他のイベントは巻き込まれない
    expect(await repository.findById("event-1")).not.toBeNull();
    expect(repository.allEvents()).toHaveLength(1);
  });
});
