import { describe, expect, it } from "vitest";
import { startsAtFromDateValue } from "../../domain/schedule/datePresets.js";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import { makeRunDueReminders } from "./runDueReminders.js";
import {
  createFakeReminderDeliveryRepository,
  createFakeReminderNotifier,
  createFakeReminderSettingsRepository,
} from "./testing/fakeReminderPorts.js";
import { createFakeScheduleRepository } from "./testing/fakeScheduleRepository.js";

// JST 2026-07-27 21:30(= minute 1290)を「現在」とする。
const FIXED_NOW = new Date("2026-07-27T12:30:00.000Z");
const TODAY = "2026-07-27";
const NOW_MINUTE = 21 * 60 + 30;

function startsAtOf(value: string): Date {
  const startsAt = startsAtFromDateValue(value);
  if (!startsAt) {
    throw new Error(`invalid date value: ${value}`);
  }
  return startsAt;
}

function responseOptions(eventId: string): ResponseOption[] {
  return [
    {
      id: `${eventId}-opt-yes`,
      label: "いつでも",
      kind: "yes",
      startMinute: null,
      position: 0,
    },
    {
      id: `${eventId}-opt-2130`,
      label: "21:30〜",
      kind: "time",
      startMinute: 21 * 60 + 30,
      position: 1,
    },
    {
      id: `${eventId}-opt-2200`,
      label: "22:00〜",
      kind: "time",
      startMinute: 22 * 60,
      position: 2,
    },
    {
      id: `${eventId}-opt-maybe`,
      label: "未定",
      kind: "maybe",
      startMinute: null,
      position: 3,
    },
    {
      id: `${eventId}-opt-no`,
      label: "不可",
      kind: "no",
      startMinute: null,
      position: 4,
    },
  ];
}

function buildEvent(opts: {
  id: string;
  guildId: string;
  guildSeq?: number;
  title?: string;
  /** 候補日(既定は今日) */
  dateValue?: string;
}): ScheduleEvent {
  const dateValue = opts.dateValue ?? TODAY;
  const candidates: Candidate[] = [
    {
      id: `${opts.id}-c0`,
      label: dateValue,
      startsAt: startsAtOf(dateValue),
      position: 0,
    },
  ];
  return {
    id: opts.id,
    guildId: opts.guildId,
    channelId: "channel-src",
    messageId: "message-1",
    creatorId: "creator-1",
    guildSeq: opts.guildSeq ?? 1,
    title: opts.title ?? "固定練習",
    description: null,
    status: "open",
    candidates,
    responseOptions: responseOptions(opts.id),
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function setup() {
  const scheduleRepository = createFakeScheduleRepository();
  const settingsRepository = createFakeReminderSettingsRepository();
  const deliveryRepository = createFakeReminderDeliveryRepository();
  const notifier = createFakeReminderNotifier();
  const runDueReminders = makeRunDueReminders({
    scheduleRepository,
    settingsRepository,
    deliveryRepository,
    notifier,
    now: () => FIXED_NOW,
  });
  return {
    scheduleRepository,
    settingsRepository,
    deliveryRepository,
    notifier,
    runDueReminders,
  };
}

describe("makeRunDueReminders", () => {
  it("発火時刻前の guild には送らず、判定記録も書かない", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1", guildId: "guild-1" }));
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-r",
      remindMinute: NOW_MINUTE + 1,
    });

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(0);
    expect(ctx.deliveryRepository.judgedKeys()).toHaveLength(0);
  });

  it("発火時刻ちょうど(remindMinute === 現在分)なら送る", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1", guildId: "guild-1" }));
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-r",
      remindMinute: NOW_MINUTE,
    });

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(1);
    expect(ctx.notifier.sent[0]?.channelId).toBe("channel-r");
    expect(ctx.notifier.sent[0]?.dateValue).toBe(TODAY);
  });

  it("発火時刻を大きく過ぎていても同じJST日なら追い送りする", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1", guildId: "guild-1" }));
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-r",
      remindMinute: 60, // JST 1:00 設定。現在は 21:30
    });

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(1);
  });

  it("判定済みのイベントは再送しない(2回呼んでも1通)", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1", guildId: "guild-1" }));
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-r",
      remindMinute: NOW_MINUTE,
    });

    await ctx.runDueReminders();
    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(1);
  });

  it("pending のイベントは送らないが判定済みとして記録し、後で active に変わっても送らない", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1", guildId: "guild-1" }));
    // 未定回答 → pending なので沈黙
    await ctx.scheduleRepository.upsertResponse({
      id: "r1",
      eventId: "e1",
      candidateId: "e1-c0",
      responseOptionId: "e1-opt-maybe",
      userId: "u1",
      now: FIXED_NOW,
    });
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-r",
      remindMinute: NOW_MINUTE,
    });

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(0);
    expect(await ctx.deliveryRepository.wasJudged("e1", TODAY)).toBe(true);

    // 回答が active に変わっても、判定は発火時の1回きりなので送らない
    await ctx.scheduleRepository.upsertResponse({
      id: "r2",
      eventId: "e1",
      candidateId: "e1-c0",
      responseOptionId: "e1-opt-yes",
      userId: "u1",
      now: FIXED_NOW,
    });
    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(0);
  });

  it("active なイベントの内容(開始時刻・メンション対象)を正しく組み立てて送る", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(
      buildEvent({ id: "e1", guildId: "guild-1", guildSeq: 3, title: "零式" }),
    );
    await ctx.scheduleRepository.upsertResponses([
      {
        id: "r1",
        eventId: "e1",
        candidateId: "e1-c0",
        responseOptionId: "e1-opt-2130",
        userId: "u1",
        now: FIXED_NOW,
      },
      {
        id: "r2",
        eventId: "e1",
        candidateId: "e1-c0",
        responseOptionId: "e1-opt-2200",
        userId: "u2",
        now: FIXED_NOW,
      },
    ]);
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-r",
      remindMinute: NOW_MINUTE,
    });

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(1);
    expect(ctx.notifier.sent[0]).toEqual({
      channelId: "channel-r",
      dateValue: TODAY,
      reminder: {
        eventId: "e1",
        guildSeq: 3,
        title: "零式",
        // 21:30 と 22:00 → 全員が来られる 22:00 開始
        startMinute: 22 * 60,
        mentionUserIds: ["u1", "u2"],
      },
    });
  });

  it("回答ゼロのイベントは active-anytime としてメンションなしで送る", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1", guildId: "guild-1" }));
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-r",
      remindMinute: NOW_MINUTE,
    });

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(1);
    expect(ctx.notifier.sent[0]?.reminder.startMinute).toBeNull();
    expect(ctx.notifier.sent[0]?.reminder.mentionUserIds).toEqual([]);
  });

  it("今日の候補を持たないイベントには送らない", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(
      buildEvent({ id: "e1", guildId: "guild-1", dateValue: "2026-07-28" }),
    );
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-r",
      remindMinute: NOW_MINUTE,
    });

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(0);
  });

  it("複数 guild・複数イベントでイベントごとに1通ずつ、各 guild のチャンネルへ送る", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(
      buildEvent({ id: "e1", guildId: "guild-1", guildSeq: 1 }),
    );
    ctx.scheduleRepository.seed(
      buildEvent({ id: "e2", guildId: "guild-1", guildSeq: 2 }),
    );
    ctx.scheduleRepository.seed(
      buildEvent({ id: "e3", guildId: "guild-2", guildSeq: 1 }),
    );
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-g1",
      remindMinute: NOW_MINUTE,
    });
    ctx.settingsRepository.seed({
      guildId: "guild-2",
      channelId: "channel-g2",
      remindMinute: NOW_MINUTE,
    });

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(3);
    const byChannel = ctx.notifier.sent.map((s) => [
      s.channelId,
      s.reminder.eventId,
    ]);
    expect(byChannel).toContainEqual(["channel-g1", "e1"]);
    expect(byChannel).toContainEqual(["channel-g1", "e2"]);
    expect(byChannel).toContainEqual(["channel-g2", "e3"]);
  });

  it("発火前の guild と発火後の guild が混在したら、発火後だけに送る", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1", guildId: "guild-1" }));
    ctx.scheduleRepository.seed(buildEvent({ id: "e2", guildId: "guild-2" }));
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-g1",
      remindMinute: NOW_MINUTE + 10, // まだ
    });
    ctx.settingsRepository.seed({
      guildId: "guild-2",
      channelId: "channel-g2",
      remindMinute: NOW_MINUTE, // 発火
    });

    await ctx.runDueReminders();

    expect(ctx.notifier.sent.map((s) => s.channelId)).toEqual(["channel-g2"]);
  });

  it("notifier が reject しても throw せず、他 guild への送信は続行する", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1", guildId: "guild-1" }));
    ctx.scheduleRepository.seed(buildEvent({ id: "e2", guildId: "guild-2" }));
    ctx.settingsRepository.seed({
      guildId: "guild-1",
      channelId: "channel-g1",
      remindMinute: NOW_MINUTE,
    });
    ctx.settingsRepository.seed({
      guildId: "guild-2",
      channelId: "channel-g2",
      remindMinute: NOW_MINUTE,
    });
    ctx.notifier.failChannel("channel-g1");

    await expect(ctx.runDueReminders()).resolves.toBeUndefined();

    expect(ctx.notifier.sent.map((s) => s.channelId)).toEqual(["channel-g2"]);
    // 送信の前に判定済みを記録するので、失敗した分も at-most-once(再送しない)
    expect(await ctx.deliveryRepository.wasJudged("e1", TODAY)).toBe(true);

    await ctx.runDueReminders();
    expect(ctx.notifier.sent).toHaveLength(1);
  });
});
