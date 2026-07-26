import { describe, expect, it } from "vitest";
import { ScheduleValidationError } from "../../domain/schedule/errors.js";
import { makeSetReminder } from "./setReminder.js";
import { createFakeReminderSettingsRepository } from "./testing/fakeReminderPorts.js";

describe("makeSetReminder", () => {
  it("設定を upsert し、find で取り出せる", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    const setReminder = makeSetReminder({ settingsRepository });

    await setReminder({
      guildId: "guild-1",
      channelId: "channel-1",
      remindMinute: 1290,
    });

    expect(await settingsRepository.find("guild-1")).toEqual({
      guildId: "guild-1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
  });

  it("同じ guild へ再設定すると上書きされる(行は増えない)", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    const setReminder = makeSetReminder({ settingsRepository });

    await setReminder({
      guildId: "guild-1",
      channelId: "channel-1",
      remindMinute: 1290,
    });
    await setReminder({
      guildId: "guild-1",
      channelId: "channel-2",
      remindMinute: 600,
    });

    expect(await settingsRepository.find("guild-1")).toEqual({
      guildId: "guild-1",
      channelId: "channel-2",
      remindMinute: 600,
    });
    expect(await settingsRepository.listAll()).toHaveLength(1);
  });

  it("境界値 0 と 1439 は受け付ける", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    const setReminder = makeSetReminder({ settingsRepository });

    await setReminder({
      guildId: "guild-1",
      channelId: "channel-1",
      remindMinute: 0,
    });
    await setReminder({
      guildId: "guild-2",
      channelId: "channel-2",
      remindMinute: 1439,
    });

    expect((await settingsRepository.find("guild-1"))?.remindMinute).toBe(0);
    expect((await settingsRepository.find("guild-2"))?.remindMinute).toBe(1439);
  });

  it("remindMinute が整数でなければ ScheduleValidationError を投げ、保存しない", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    const setReminder = makeSetReminder({ settingsRepository });

    await expect(
      setReminder({
        guildId: "guild-1",
        channelId: "channel-1",
        remindMinute: 12.5,
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(await settingsRepository.find("guild-1")).toBeNull();
  });

  it("remindMinute が範囲外(負)なら ScheduleValidationError を投げ、保存しない", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    const setReminder = makeSetReminder({ settingsRepository });

    await expect(
      setReminder({
        guildId: "guild-1",
        channelId: "channel-1",
        remindMinute: -1,
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(await settingsRepository.find("guild-1")).toBeNull();
  });

  it("remindMinute が範囲外(1440以上)なら ScheduleValidationError を投げ、保存しない", async () => {
    const settingsRepository = createFakeReminderSettingsRepository();
    const setReminder = makeSetReminder({ settingsRepository });

    await expect(
      setReminder({
        guildId: "guild-1",
        channelId: "channel-1",
        remindMinute: 1440,
      }),
    ).rejects.toBeInstanceOf(ScheduleValidationError);
    expect(await settingsRepository.find("guild-1")).toBeNull();
  });
});
