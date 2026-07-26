import { describe, expect, it } from "vitest";
import { startsAtFromDateValue } from "../../domain/schedule/datePresets.js";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import { makeRunDueReminders } from "./runDueReminders.js";
import {
  createFakeEventReminderRepository,
  createFakeReminderDeliveryRepository,
  createFakeReminderNotifier,
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
  guildId?: string;
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
    guildId: opts.guildId ?? "guild-1",
    // 予定が作られたチャンネル。リマインドの送信先とは別物である点に注意。
    channelId: "channel-event",
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
  const reminderRepository = createFakeEventReminderRepository();
  const deliveryRepository = createFakeReminderDeliveryRepository();
  const notifier = createFakeReminderNotifier();
  const sendErrors: unknown[] = [];
  const runDueReminders = makeRunDueReminders({
    scheduleRepository,
    reminderRepository,
    deliveryRepository,
    notifier,
    now: () => FIXED_NOW,
    onSendError: (error: unknown) => {
      sendErrors.push(error);
    },
  });
  return {
    scheduleRepository,
    reminderRepository,
    deliveryRepository,
    notifier,
    sendErrors,
    runDueReminders,
  };
}

describe("makeRunDueReminders", () => {
  it("発火対象の問い合わせは JST 当日の候補日と現在の分で行う", async () => {
    const ctx = setup();

    await ctx.runDueReminders();

    expect(ctx.reminderRepository.listDueCalls).toEqual([
      { startsAt: startsAtOf(TODAY), minute: NOW_MINUTE },
    ]);
  });

  it("発火対象が無ければ送信も判定記録もしない", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1" }));
    ctx.reminderRepository.setDue([]);

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(0);
    expect(ctx.deliveryRepository.judgedKeys()).toHaveLength(0);
  });

  it("発火対象は予定ごとのリマインド先チャンネルへ送る(予定の作成チャンネルではない)", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1" }));
    ctx.reminderRepository.setDue([
      { eventId: "e1", channelId: "channel-remind" },
    ]);

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(1);
    expect(ctx.notifier.sent[0]?.channelId).toBe("channel-remind");
    expect(ctx.notifier.sent[0]?.dateValue).toBe(TODAY);
  });

  it("判定済みの予定は再送しない(2回呼んでも1通)", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1" }));
    ctx.reminderRepository.setDue([
      { eventId: "e1", channelId: "channel-remind" },
    ]);

    await ctx.runDueReminders();
    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(1);
  });

  it("pending の予定は送らないが判定済みとして記録し、後で active に変わっても送らない", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1" }));
    // 未定回答 → pending なので沈黙
    await ctx.scheduleRepository.upsertResponse({
      id: "r1",
      eventId: "e1",
      candidateId: "e1-c0",
      responseOptionId: "e1-opt-maybe",
      userId: "u1",
      now: FIXED_NOW,
    });
    ctx.reminderRepository.setDue([
      { eventId: "e1", channelId: "channel-remind" },
    ]);

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

  it("active な予定の内容(開始時刻・メンション対象)を正しく組み立てて送る", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(
      buildEvent({ id: "e1", guildSeq: 3, title: "零式" }),
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
    ctx.reminderRepository.setDue([
      { eventId: "e1", channelId: "channel-remind" },
    ]);

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(1);
    expect(ctx.notifier.sent[0]).toEqual({
      channelId: "channel-remind",
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

  it("回答ゼロの予定は active-anytime としてメンションなしで送る", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1" }));
    ctx.reminderRepository.setDue([
      { eventId: "e1", channelId: "channel-remind" },
    ]);

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(1);
    expect(ctx.notifier.sent[0]?.reminder.startMinute).toBeNull();
    expect(ctx.notifier.sent[0]?.reminder.mentionUserIds).toEqual([]);
  });

  it("発火対象を引いた後に消えていた予定は skip し、判定記録も書かない", async () => {
    const ctx = setup();
    // scheduleRepository には存在しない eventId が発火対象として返る
    ctx.reminderRepository.setDue([
      { eventId: "gone", channelId: "channel-remind" },
    ]);

    await expect(ctx.runDueReminders()).resolves.toBeUndefined();

    expect(ctx.notifier.sent).toHaveLength(0);
    expect(ctx.deliveryRepository.judgedKeys()).toHaveLength(0);
  });

  it("複数の予定はそれぞれの送信先へ1通ずつ送る", async () => {
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
    ctx.reminderRepository.setDue([
      { eventId: "e1", channelId: "channel-a" },
      { eventId: "e2", channelId: "channel-b" },
      { eventId: "e3", channelId: "channel-c" },
    ]);

    await ctx.runDueReminders();

    expect(ctx.notifier.sent).toHaveLength(3);
    const pairs = ctx.notifier.sent.map((s) => [
      s.channelId,
      s.reminder.eventId,
    ]);
    expect(pairs).toContainEqual(["channel-a", "e1"]);
    expect(pairs).toContainEqual(["channel-b", "e2"]);
    expect(pairs).toContainEqual(["channel-c", "e3"]);
  });

  it("notifier が reject しても throw せず、他の予定への送信は続行する", async () => {
    const ctx = setup();
    ctx.scheduleRepository.seed(buildEvent({ id: "e1", guildSeq: 1 }));
    ctx.scheduleRepository.seed(buildEvent({ id: "e2", guildSeq: 2 }));
    ctx.reminderRepository.setDue([
      { eventId: "e1", channelId: "channel-a" },
      { eventId: "e2", channelId: "channel-b" },
    ]);
    ctx.notifier.failChannel("channel-a");

    await expect(ctx.runDueReminders()).resolves.toBeUndefined();

    expect(ctx.notifier.sent.map((s) => s.channelId)).toEqual(["channel-b"]);
    expect(ctx.sendErrors).toHaveLength(1);
    // 送信の前に判定済みを記録するので、失敗した分も at-most-once(再送しない)
    expect(await ctx.deliveryRepository.wasJudged("e1", TODAY)).toBe(true);

    await ctx.runDueReminders();
    expect(ctx.notifier.sent).toHaveLength(1);
  });

  it("onSendError が未指定でも送信失敗を握りつぶす", async () => {
    const scheduleRepository = createFakeScheduleRepository();
    const reminderRepository = createFakeEventReminderRepository();
    const deliveryRepository = createFakeReminderDeliveryRepository();
    const notifier = createFakeReminderNotifier();
    const runDueReminders = makeRunDueReminders({
      scheduleRepository,
      reminderRepository,
      deliveryRepository,
      notifier,
      now: () => FIXED_NOW,
    });
    scheduleRepository.seed(buildEvent({ id: "e1" }));
    reminderRepository.setDue([{ eventId: "e1", channelId: "channel-a" }]);
    notifier.failChannel("channel-a");

    await expect(runDueReminders()).resolves.toBeUndefined();
  });
});
