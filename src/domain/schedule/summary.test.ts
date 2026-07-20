import { describe, expect, it } from "vitest";
import type {
  Candidate,
  Response,
  ResponseOption,
  ScheduleEvent,
} from "./scheduleEvent.js";
import { type CandidateSummary, summarizeResponses } from "./summary.js";

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");

function makeEvent(): ScheduleEvent {
  const candidates: Candidate[] = [
    { id: "c0", label: "7/25(金)", startsAt: null, position: 0 },
    { id: "c1", label: "7/26(土)", startsAt: null, position: 1 },
  ];
  const responseOptions: ResponseOption[] = [
    {
      id: "yes",
      label: "いつでも",
      kind: "yes",
      startMinute: null,
      position: 0,
    },
    {
      id: "t21",
      label: "21:00〜",
      kind: "time",
      startMinute: 1260,
      position: 1,
    },
    {
      id: "t22",
      label: "22:00〜",
      kind: "time",
      startMinute: 1320,
      position: 2,
    },
    {
      id: "maybe",
      label: "未定",
      kind: "maybe",
      startMinute: null,
      position: 3,
    },
    { id: "no", label: "不可", kind: "no", startMinute: null, position: 4 },
  ];
  return {
    id: "event-1",
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: null,
    creatorId: "creator-1",
    guildSeq: 1,
    title: "固定活動の日程",
    description: null,
    status: "open",
    candidates,
    responseOptions,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function resp(
  candidateId: string,
  responseOptionId: string,
  userId: string,
): Response {
  return { candidateId, responseOptionId, userId };
}

function summaryFor(
  summary: { candidates: readonly CandidateSummary[] },
  candidateId: string,
): CandidateSummary {
  const found = summary.candidates.find((c) => c.candidate.id === candidateId);
  if (!found) {
    throw new Error(`candidate summary not found: ${candidateId}`);
  }
  return found;
}

describe("summarizeResponses", () => {
  it("回答0件でも全候補・全選択肢を列挙し count は0", () => {
    const event = makeEvent();

    const summary = summarizeResponses(event, []);

    expect(summary.candidates).toHaveLength(2);
    const c0 = summaryFor(summary, "c0");
    expect(c0.optionTallies.map((t) => t.responseOptionId)).toEqual([
      "yes",
      "t21",
      "t22",
      "maybe",
      "no",
    ]);
    expect(c0.optionTallies.every((t) => t.count === 0)).toBe(true);
    expect(c0.anytimeCount).toBe(0);
    expect(c0.maybeCount).toBe(0);
    expect(c0.unavailableCount).toBe(0);
  });

  it("回答0件でも startTimes は time 選択肢ぶん列挙され attendableCount は0", () => {
    const event = makeEvent();

    const summary = summarizeResponses(event, []);
    const c0 = summaryFor(summary, "c0");

    expect(c0.startTimes).toEqual([
      {
        responseOptionId: "t21",
        label: "21:00〜",
        startMinute: 1260,
        attendableCount: 0,
      },
      {
        responseOptionId: "t22",
        label: "22:00〜",
        startMinute: 1320,
        attendableCount: 0,
      },
    ]);
  });

  it("いつでも + 時刻の混在で attendableCount が包含的に積み上がる", () => {
    const event = makeEvent();
    const responses = [
      resp("c0", "yes", "u1"),
      resp("c0", "yes", "u2"),
      resp("c0", "t21", "u3"),
      resp("c0", "t22", "u4"),
    ];

    const summary = summarizeResponses(event, responses);
    const c0 = summaryFor(summary, "c0");

    expect(c0.anytimeCount).toBe(2);
    // 21:00 = いつでも2 + 21:00〜可1 = 3
    // 22:00 = いつでも2 + (21:00〜 と 22:00〜)2 = 4
    expect(c0.startTimes).toEqual([
      {
        responseOptionId: "t21",
        label: "21:00〜",
        startMinute: 1260,
        attendableCount: 3,
      },
      {
        responseOptionId: "t22",
        label: "22:00〜",
        startMinute: 1320,
        attendableCount: 4,
      },
    ]);
  });

  it("開始時刻 t = startMinute の回答者はその時刻で数える(境界 <=)", () => {
    const event = makeEvent();
    const responses = [resp("c0", "t21", "u1")];

    const summary = summarizeResponses(event, responses);
    const c0 = summaryFor(summary, "c0");
    const t21 = c0.startTimes.find((s) => s.responseOptionId === "t21");

    expect(t21?.attendableCount).toBe(1);
  });

  it("maybe / no は attendableCount に数えない", () => {
    const event = makeEvent();
    const responses = [
      resp("c0", "yes", "u1"),
      resp("c0", "maybe", "u2"),
      resp("c0", "no", "u3"),
    ];

    const summary = summarizeResponses(event, responses);
    const c0 = summaryFor(summary, "c0");

    expect(c0.maybeCount).toBe(1);
    expect(c0.unavailableCount).toBe(1);
    // いつでも1のみ。maybe/no は開始時刻の人数に含めない。
    expect(c0.startTimes.map((s) => s.attendableCount)).toEqual([1, 1]);
  });

  it("optionTallies の count と respondentIds を集計する", () => {
    const event = makeEvent();
    const responses = [
      resp("c0", "yes", "u1"),
      resp("c0", "yes", "u2"),
      resp("c0", "t21", "u3"),
    ];

    const summary = summarizeResponses(event, responses);
    const c0 = summaryFor(summary, "c0");
    const yes = c0.optionTallies.find((t) => t.responseOptionId === "yes");

    expect(yes?.count).toBe(2);
    expect(yes?.respondentIds).toEqual(["u1", "u2"]);
  });

  it("respondentIds は入力 responses の順に安定させる", () => {
    const event = makeEvent();
    const responses = [resp("c0", "yes", "u2"), resp("c0", "yes", "u1")];

    const summary = summarizeResponses(event, responses);
    const c0 = summaryFor(summary, "c0");
    const yes = c0.optionTallies.find((t) => t.responseOptionId === "yes");

    expect(yes?.respondentIds).toEqual(["u2", "u1"]);
  });

  it("イベントに属さない candidateId の回答は無視する", () => {
    const event = makeEvent();
    const responses = [resp("ghost", "yes", "u1")];

    const summary = summarizeResponses(event, responses);

    expect(summary.candidates).toHaveLength(2);
    for (const c of summary.candidates) {
      expect(c.anytimeCount).toBe(0);
    }
  });

  it("イベントに属さない responseOptionId の回答は無視する", () => {
    const event = makeEvent();
    const responses = [resp("c0", "ghost-option", "u1")];

    const summary = summarizeResponses(event, responses);
    const c0 = summaryFor(summary, "c0");

    expect(c0.optionTallies.every((t) => t.count === 0)).toBe(true);
    expect(c0.anytimeCount).toBe(0);
  });

  it("候補は position 昇順で列挙する", () => {
    const event = makeEvent();

    const summary = summarizeResponses(event, []);

    expect(summary.candidates.map((c) => c.candidate.position)).toEqual([0, 1]);
  });

  it("summary は元の event を保持する", () => {
    const event = makeEvent();

    const summary = summarizeResponses(event, []);

    expect(summary.event).toBe(event);
  });
});
