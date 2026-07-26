import { describe, expect, it } from "vitest";
import { canDeleteEvent } from "./authorization.js";
import type { ScheduleEvent } from "./scheduleEvent.js";

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");

function event(creatorId: string): ScheduleEvent {
  return {
    id: "event-1",
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: null,
    creatorId,
    guildSeq: 1,
    title: "固定活動の日程",
    description: null,
    status: "open",
    candidates: [],
    responseOptions: [],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

describe("canDeleteEvent", () => {
  it("作成者本人は管理権限が無くても削除できる", () => {
    expect(
      canDeleteEvent(event("u1"), {
        userId: "u1",
        hasManagePermission: false,
      }),
    ).toBe(true);
  });

  it("管理権限を持てば作成者でなくても削除できる", () => {
    expect(
      canDeleteEvent(event("u1"), {
        userId: "u2",
        hasManagePermission: true,
      }),
    ).toBe(true);
  });

  it("作成者でも管理権限でもなければ削除できない", () => {
    expect(
      canDeleteEvent(event("u1"), {
        userId: "u2",
        hasManagePermission: false,
      }),
    ).toBe(false);
  });
});
