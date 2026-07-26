import { describe, expect, it } from "vitest";
import { startsAtFromDateValue } from "./datePresets.js";
import { jstClock, parseReminderTime, planDailyReminder } from "./reminder.js";
import type {
  Candidate,
  Response,
  ResponseOption,
  ScheduleEvent,
} from "./scheduleEvent.js";
import { type ScheduleSummary, summarizeResponses } from "./summary.js";

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");
const TODAY = "2026-07-27";

/** "YYYY-MM-DD" から 00:00 JST の UTC Date を作る(テスト入力は常に正しい前提)。 */
function startsAtOf(value: string): Date {
  const startsAt = startsAtFromDateValue(value);
  if (!startsAt) {
    throw new Error(`invalid date value: ${value}`);
  }
  return startsAt;
}

const RESPONSE_OPTIONS: ResponseOption[] = [
  {
    id: "opt-yes",
    label: "いつでも",
    kind: "yes",
    startMinute: null,
    position: 0,
  },
  {
    id: "opt-2130",
    label: "21:30〜",
    kind: "time",
    startMinute: 21 * 60 + 30,
    position: 1,
  },
  {
    id: "opt-2200",
    label: "22:00〜",
    kind: "time",
    startMinute: 22 * 60,
    position: 2,
  },
  {
    id: "opt-maybe",
    label: "未定",
    kind: "maybe",
    startMinute: null,
    position: 3,
  },
  { id: "opt-no", label: "不可", kind: "no", startMinute: null, position: 4 },
];

function candidateOn(
  id: string,
  dateValue: string | null,
  position: number,
): Candidate {
  return {
    id,
    label: dateValue ?? "未定",
    startsAt: dateValue ? startsAtOf(dateValue) : null,
    position,
  };
}

function buildEvent(candidates: readonly Candidate[]): ScheduleEvent {
  return {
    id: "event-1",
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: "message-1",
    creatorId: "creator-1",
    guildSeq: 3,
    title: "固定練習",
    description: null,
    status: "open",
    candidates,
    responseOptions: RESPONSE_OPTIONS,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function response(
  candidateId: string,
  responseOptionId: string,
  userId: string,
): Response {
  return { candidateId, responseOptionId, userId };
}

function summaryOf(
  candidates: readonly Candidate[],
  responses: readonly Response[],
): ScheduleSummary {
  return summarizeResponses(buildEvent(candidates), responses);
}

describe("jstClock", () => {
  it("UTC深夜はJSTでは翌日になる(日付繰り上がり)", () => {
    // UTC 7/26 15:30 = JST 7/27 00:30
    expect(jstClock(new Date("2026-07-26T15:30:00Z"))).toEqual({
      dateValue: "2026-07-27",
      minute: 30,
    });
  });

  it("JST日中の時刻を暦日と0時からの経過分に分解する", () => {
    // UTC 7/26 03:00 = JST 7/26 12:00
    expect(jstClock(new Date("2026-07-26T03:00:00Z"))).toEqual({
      dateValue: "2026-07-26",
      minute: 720,
    });
  });

  it("JSTの23:59は同日の1439分(日付をまたぐ直前)", () => {
    // UTC 7/26 14:59 = JST 7/26 23:59
    expect(jstClock(new Date("2026-07-26T14:59:00Z"))).toEqual({
      dateValue: "2026-07-26",
      minute: 1439,
    });
  });
});

describe("parseReminderTime", () => {
  it('"HH:MM" を分に解析する', () => {
    expect(parseReminderTime("21:30")).toBe(1290);
  });

  it('"H:MM"(時が1桁)も受け付ける', () => {
    expect(parseReminderTime("9:05")).toBe(545);
  });

  it("前後の空白はトリムする", () => {
    expect(parseReminderTime(" 21:30 ")).toBe(1290);
  });

  it("境界値 00:00 と 23:59 を受け付ける", () => {
    expect(parseReminderTime("00:00")).toBe(0);
    expect(parseReminderTime("23:59")).toBe(1439);
  });

  it("24:00 は範囲外なので null", () => {
    expect(parseReminderTime("24:00")).toBeNull();
  });

  it("21:60 は範囲外なので null", () => {
    expect(parseReminderTime("21:60")).toBeNull();
  });

  it("時刻でない文字列は null", () => {
    expect(parseReminderTime("abc")).toBeNull();
  });

  it("空文字は null", () => {
    expect(parseReminderTime("")).toBeNull();
  });
});

describe("planDailyReminder", () => {
  it("全員「いつでも」なら startMinute: null でリマインドする", () => {
    const candidates = [candidateOn("c0", TODAY, 0)];
    const summary = summaryOf(candidates, [
      response("c0", "opt-yes", "u1"),
      response("c0", "opt-yes", "u2"),
    ]);

    const plan = planDailyReminder(summary, TODAY);

    expect(plan).toEqual({
      eventId: "event-1",
      guildSeq: 3,
      title: "固定練習",
      startMinute: null,
      mentionUserIds: ["u1", "u2"],
    });
  });

  it("時刻回答があれば全員が来られる最も遅い時刻を開始にする", () => {
    const candidates = [candidateOn("c0", TODAY, 0)];
    const summary = summaryOf(candidates, [
      response("c0", "opt-2130", "u1"),
      response("c0", "opt-2200", "u2"),
    ]);

    const plan = planDailyReminder(summary, TODAY);

    // decideDayStatus と同じルール: 21:30 と 22:00 なら 22:00 開始
    expect(plan?.startMinute).toBe(22 * 60);
  });

  it("誰かが不可なら休みなのでリマインドしない", () => {
    const candidates = [candidateOn("c0", TODAY, 0)];
    const summary = summaryOf(candidates, [
      response("c0", "opt-yes", "u1"),
      response("c0", "opt-no", "u2"),
    ]);

    expect(planDailyReminder(summary, TODAY)).toBeNull();
  });

  it("不可はいないが未定がいるなら連絡待ちなのでリマインドしない", () => {
    const candidates = [candidateOn("c0", TODAY, 0)];
    const summary = summaryOf(candidates, [
      response("c0", "opt-yes", "u1"),
      response("c0", "opt-maybe", "u2"),
    ]);

    expect(planDailyReminder(summary, TODAY)).toBeNull();
  });

  it("todayValue に一致する候補がなければ null", () => {
    const candidates = [candidateOn("c0", "2026-07-28", 0)];
    const summary = summaryOf(candidates, [response("c0", "opt-yes", "u1")]);

    expect(planDailyReminder(summary, TODAY)).toBeNull();
  });

  it("startsAt が null の候補しかなければ null", () => {
    const candidates = [candidateOn("c0", null, 0)];
    const summary = summaryOf(candidates, [response("c0", "opt-yes", "u1")]);

    expect(planDailyReminder(summary, TODAY)).toBeNull();
  });

  it("回答ゼロでもデフォルト参加扱いでリマインドし、メンション対象は空", () => {
    const candidates = [candidateOn("c0", TODAY, 0)];
    const summary = summaryOf(candidates, []);

    const plan = planDailyReminder(summary, TODAY);

    expect(plan).toEqual({
      eventId: "event-1",
      guildSeq: 3,
      title: "固定練習",
      startMinute: null,
      mentionUserIds: [],
    });
  });

  it("mentionUserIds は今日以外の候補への回答者も含み、重複しない", () => {
    // u1 は今日(c0)と別日(c1)の両方に回答、u2 は別日(c1)にだけ回答。
    // 回答履歴=参加者なので両者とも含まれ、u1 は1回だけ現れる。
    const candidates = [
      candidateOn("c0", TODAY, 0),
      candidateOn("c1", "2026-07-28", 1),
    ];
    const summary = summaryOf(candidates, [
      response("c0", "opt-yes", "u1"),
      response("c1", "opt-2130", "u2"),
      response("c1", "opt-yes", "u1"),
    ]);

    const plan = planDailyReminder(summary, TODAY);

    expect(plan?.mentionUserIds).toEqual(["u1", "u2"]);
  });

  it("同日の候補が複数あれば position 順で最初に active 系になったものを採用する", () => {
    // position 0 の候補は不可持ち(rest)、position 1 の候補が active。
    const candidates = [
      candidateOn("c0", TODAY, 0),
      candidateOn("c1", TODAY, 1),
    ];
    const summary = summaryOf(candidates, [
      response("c0", "opt-no", "uA"),
      response("c1", "opt-2200", "u1"),
    ]);

    const plan = planDailyReminder(summary, TODAY);

    expect(plan?.startMinute).toBe(22 * 60);
    expect(plan?.mentionUserIds).toEqual(["uA", "u1"]);
  });

  it("同日の候補が両方 active でも先頭(position 順)を採用する", () => {
    // position 0 は active-anytime、position 1 は時刻あり active。先頭が勝つ。
    const candidates = [
      candidateOn("c0", TODAY, 0),
      candidateOn("c1", TODAY, 1),
    ];
    const summary = summaryOf(candidates, [
      response("c0", "opt-yes", "u1"),
      response("c1", "opt-2200", "u1"),
    ]);

    const plan = planDailyReminder(summary, TODAY);

    expect(plan?.startMinute).toBeNull();
  });
});
