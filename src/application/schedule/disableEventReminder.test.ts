import { describe, expect, it } from "vitest";
import { makeDisableEventReminder } from "./disableEventReminder.js";
import { createFakeEventReminderRepository } from "./testing/fakeReminderPorts.js";

describe("makeDisableEventReminder", () => {
  it("設定が存在すれば削除して true を返す", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    reminderRepository.seed({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    const disableEventReminder = makeDisableEventReminder({
      reminderRepository,
    });

    const result = await disableEventReminder({ eventId: "e1" });

    expect(result).toBe(true);
    expect(await reminderRepository.find("e1")).toBeNull();
  });

  it("設定が存在しなければ false を返す(no-op)", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    const disableEventReminder = makeDisableEventReminder({
      reminderRepository,
    });

    const result = await disableEventReminder({ eventId: "e1" });

    expect(result).toBe(false);
    expect(reminderRepository.all()).toHaveLength(0);
  });

  it("他の予定の設定は巻き込まない", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    reminderRepository.seed({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    reminderRepository.seed({
      eventId: "e2",
      channelId: "channel-2",
      remindMinute: 600,
    });
    const disableEventReminder = makeDisableEventReminder({
      reminderRepository,
    });

    await disableEventReminder({ eventId: "e1" });

    expect(await reminderRepository.find("e2")).toEqual({
      eventId: "e2",
      channelId: "channel-2",
      remindMinute: 600,
    });
  });
});
