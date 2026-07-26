import { describe, expect, it } from "vitest";
import { makeDisableReminder } from "./disableReminder.js";
import { createFakeReminderSettingsRepository } from "./testing/fakeReminderPorts.js";

describe("makeDisableReminder", () => {
  it("設定が存在すれば削除して true を返す", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    const disableReminder = makeDisableReminder({ settingsRepository });

    const result = await disableReminder({ guildId: "guild-1" });

    expect(result).toBe(true);
    expect(await settingsRepository.find("guild-1")).toBeNull();
  });

  it("設定が存在しなければ false を返す(no-op)", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    const disableReminder = makeDisableReminder({ settingsRepository });

    const result = await disableReminder({ guildId: "guild-1" });

    expect(result).toBe(false);
  });

  it("他の guild の設定は巻き込まない", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    settingsRepository.seed({
      guildId: "guild-2",
      channelId: "channel-2",
      remindMinute: 600,
    });
    const disableReminder = makeDisableReminder({ settingsRepository });

    await disableReminder({ guildId: "guild-1" });

    expect(await settingsRepository.find("guild-2")).not.toBeNull();
  });
});
