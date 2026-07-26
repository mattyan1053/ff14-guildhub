import { describe, expect, it } from "vitest";
import { ScheduleValidationError } from "../../domain/schedule/errors.js";
import { makeSetEventReminder } from "./setEventReminder.js";
import { createFakeEventReminderRepository } from "./testing/fakeReminderPorts.js";

describe("makeSetEventReminder", () => {
  it("設定を upsert し、find で取り出せる", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    const setEventReminder = makeSetEventReminder({ reminderRepository });

    await setEventReminder({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });

    expect(await reminderRepository.find("e1")).toEqual({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
  });

  it("同じ予定へ再設定すると上書きされる(行は増えない)", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    const setEventReminder = makeSetEventReminder({ reminderRepository });

    await setEventReminder({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    await setEventReminder({
      eventId: "e1",
      channelId: "channel-2",
      remindMinute: 600,
    });

    expect(await reminderRepository.find("e1")).toEqual({
      eventId: "e1",
      channelId: "channel-2",
      remindMinute: 600,
    });
    expect(reminderRepository.all()).toHaveLength(1);
  });

  it("予定ごとに独立して設定できる", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    const setEventReminder = makeSetEventReminder({ reminderRepository });

    await setEventReminder({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    await setEventReminder({
      eventId: "e2",
      channelId: "channel-2",
      remindMinute: 600,
    });

    expect(await reminderRepository.find("e1")).toEqual({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    expect(await reminderRepository.find("e2")).toEqual({
      eventId: "e2",
      channelId: "channel-2",
      remindMinute: 600,
    });
  });

  it("境界値 0 と 1439 は受け付ける", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    const setEventReminder = makeSetEventReminder({ reminderRepository });

    await setEventReminder({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 0,
    });
    await setEventReminder({
      eventId: "e2",
      channelId: "channel-2",
      remindMinute: 1439,
    });

    expect((await reminderRepository.find("e1"))?.remindMinute).toBe(0);
    expect((await reminderRepository.find("e2"))?.remindMinute).toBe(1439);
  });

  it("remindMinute が整数でなければ ScheduleValidationError を投げ、保存しない", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    const setEventReminder = makeSetEventReminder({ reminderRepository });

    await expect(
      setEventReminder({
        eventId: "e1",
        channelId: "channel-1",
        remindMinute: 12.5,
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(await reminderRepository.find("e1")).toBeNull();
  });

  it("remindMinute が範囲外(負)なら ScheduleValidationError を投げ、保存しない", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    const setEventReminder = makeSetEventReminder({ reminderRepository });

    await expect(
      setEventReminder({
        eventId: "e1",
        channelId: "channel-1",
        remindMinute: -1,
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(await reminderRepository.find("e1")).toBeNull();
  });

  it("remindMinute が範囲外(1440以上)なら ScheduleValidationError を投げ、保存しない", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    const setEventReminder = makeSetEventReminder({ reminderRepository });

    await expect(
      setEventReminder({
        eventId: "e1",
        channelId: "channel-1",
        remindMinute: 1440,
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(await reminderRepository.find("e1")).toBeNull();
  });

  it("不正な remindMinute では既存の設定を壊さない", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    reminderRepository.seed({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    const setEventReminder = makeSetEventReminder({ reminderRepository });

    await expect(
      setEventReminder({
        eventId: "e1",
        channelId: "channel-2",
        remindMinute: 1440,
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);

    expect(await reminderRepository.find("e1")).toEqual({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
  });
});
