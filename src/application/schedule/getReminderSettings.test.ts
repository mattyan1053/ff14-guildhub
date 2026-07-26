import { describe, expect, it } from "vitest";
import { makeGetReminderSettings } from "./getReminderSettings.js";
import { createFakeReminderSettingsRepository } from "./testing/fakeReminderPorts.js";

describe("makeGetReminderSettings", () => {
  it("設定済みの guild は設定を返す", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    const getReminderSettings = makeGetReminderSettings({ settingsRepository });

    const settings = await getReminderSettings({ guildId: "guild-1" });

    expect(settings).toEqual({
      guildId: "guild-1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
  });

  it("未設定の guild は null を返す", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    const getReminderSettings = makeGetReminderSettings({ settingsRepository });

    expect(await getReminderSettings({ guildId: "guild-1" })).toBeNull();
  });
});
