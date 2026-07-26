import { describe, expect, it } from "vitest";
import { makeGetEventReminder } from "./getEventReminder.js";
import { createFakeEventReminderRepository } from "./testing/fakeReminderPorts.js";

describe("makeGetEventReminder", () => {
  it("設定済みの予定は設定を返す", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    reminderRepository.seed({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    const getEventReminder = makeGetEventReminder({ reminderRepository });

    const reminder = await getEventReminder({ eventId: "e1" });

    expect(reminder).toEqual({
      eventId: "e1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
  });

  it("未設定の予定は null を返す", async () => {
    const reminderRepository = createFakeEventReminderRepository();
    const getEventReminder = makeGetEventReminder({ reminderRepository });

    expect(await getEventReminder({ eventId: "e1" })).toBeNull();
  });
});
