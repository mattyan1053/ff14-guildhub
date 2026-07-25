import { describe, expect, it } from "vitest";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import { makeAttachScheduleMessage } from "./attachScheduleMessage.js";
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

describe("makeAttachScheduleMessage", () => {
  it("イベントに公開メッセージの投稿先チャンネルとIDを紐づける", async () => {
    const repository = createFakeScheduleRepository();
    repository.seed(seededEvent());
    const attachScheduleMessage = makeAttachScheduleMessage({ repository });

    // 別チャンネルに再表示したケース(channel-1 で作成 → channel-2 に投稿)。
    await attachScheduleMessage({
      eventId: "event-1",
      channelId: "channel-2",
      messageId: "message-123",
    });
    const stored = await repository.findById("event-1");

    expect(stored?.messageId).toBe("message-123");
    expect(stored?.channelId).toBe("channel-2");
  });
});
