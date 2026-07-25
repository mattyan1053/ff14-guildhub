import { describe, expect, it } from "vitest";
import { startsAtFromDateValue } from "../../domain/schedule/datePresets.js";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../domain/schedule/scheduleEvent.js";
import type {
  CandidateSummary,
  OptionTally,
  ScheduleSummary,
} from "../../domain/schedule/summary.js";
import {
  applyKind,
  candidateWeeks,
  commitEntries,
  type Draft,
  type DraftKind,
  daysInWeek,
  draftDetailText,
  initialDraft,
  parseDraftDetail,
} from "./answerPanelModel.js";

const OPTIONS: ResponseOption[] = [
  { id: "yes", label: "いつでも", kind: "yes", startMinute: null, position: 0 },
  { id: "t21", label: "21:00〜", kind: "time", startMinute: 1260, position: 1 },
  { id: "t22", label: "22:00〜", kind: "time", startMinute: 1320, position: 2 },
  { id: "maybe", label: "未定", kind: "maybe", startMinute: null, position: 3 },
  { id: "no", label: "不可", kind: "no", startMinute: null, position: 4 },
];

function candidate(dateValue: string | null, position: number): Candidate {
  return {
    id: `c-${dateValue ?? "none"}`,
    label: dateValue ?? "カスタム",
    startsAt: dateValue ? startsAtFromDateValue(dateValue) : null,
    position,
  };
}

function eventOf(dateValues: (string | null)[]): ScheduleEvent {
  return {
    id: "event-1",
    guildId: "g",
    channelId: "ch",
    messageId: null,
    creatorId: "creator",
    guildSeq: 1,
    title: "固定練習",
    description: null,
    status: "open",
    candidates: dateValues.map((v, i) => candidate(v, i)),
    responseOptions: OPTIONS,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function candSummary(
  dateValue: string,
  position: number,
  userOption: string | null,
  userId = "u1",
): CandidateSummary {
  const optionTallies: OptionTally[] = OPTIONS.map((o) => ({
    responseOptionId: o.id,
    label: o.label,
    kind: o.kind,
    count: userOption === o.id ? 1 : 0,
    respondentIds: userOption === o.id ? [userId] : [],
  }));
  return {
    candidate: candidate(dateValue, position),
    optionTallies,
    startTimes: [],
    anytimeCount: userOption === "yes" ? 1 : 0,
    maybeCount: userOption === "maybe" ? 1 : 0,
    unavailableCount: userOption === "no" ? 1 : 0,
  };
}

function summaryOf(candidates: CandidateSummary[]): ScheduleSummary {
  return {
    event: eventOf(candidates.map((c) => c.candidate.label)),
    candidates,
  };
}

describe("initialDraft", () => {
  it("既存回答が無い候補はデフォルト参加可(attend)", () => {
    const draft = initialDraft(
      summaryOf([candSummary("2026-07-25", 0, null)]),
      "u1",
    );
    expect(draft.get("2026-07-25")).toBe("attend");
  });

  it("既存回答を種別へ写す(yes→attend / no / maybe / time→startMinute)", () => {
    const summary = summaryOf([
      candSummary("2026-07-25", 0, "yes"),
      candSummary("2026-07-26", 1, "no"),
      candSummary("2026-07-27", 2, "maybe"),
      candSummary("2026-07-28", 3, "t22"),
    ]);
    const draft = initialDraft(summary, "u1");
    expect(draft.get("2026-07-25")).toBe("attend");
    expect(draft.get("2026-07-26")).toBe("no");
    expect(draft.get("2026-07-27")).toBe("maybe");
    expect(draft.get("2026-07-28")).toEqual({ startMinute: 1320 });
  });

  it("日付なし候補は下書きに含めない", () => {
    const summary: ScheduleSummary = {
      event: eventOf(["2026-07-25", null]),
      candidates: [
        candSummary("2026-07-25", 0, null),
        {
          candidate: candidate(null, 1),
          optionTallies: [],
          startTimes: [],
          anytimeCount: 0,
          maybeCount: 0,
          unavailableCount: 0,
        },
      ],
    };
    const draft = initialDraft(summary, "u1");
    expect(draft.size).toBe(1);
    expect(draft.has("2026-07-25")).toBe(true);
  });
});

describe("applyKind", () => {
  it("指定した日付だけ種別を変える(他は保持)", () => {
    const draft: Draft = new Map<string, DraftKind>([
      ["2026-07-25", "attend"],
      ["2026-07-26", "attend"],
    ]);
    const next = applyKind(draft, ["2026-07-26"], "no");
    expect(next.get("2026-07-25")).toBe("attend");
    expect(next.get("2026-07-26")).toBe("no");
  });

  it("複数日に一括適用できる", () => {
    const draft: Draft = new Map<string, DraftKind>([
      ["2026-07-25", "attend"],
      ["2026-07-26", "attend"],
      ["2026-07-27", "attend"],
    ]);
    const next = applyKind(draft, ["2026-07-25", "2026-07-27"], {
      startMinute: 1260,
    });
    expect(next.get("2026-07-25")).toEqual({ startMinute: 1260 });
    expect(next.get("2026-07-26")).toBe("attend");
    expect(next.get("2026-07-27")).toEqual({ startMinute: 1260 });
  });

  it("下書きに無い日付は無視する", () => {
    const draft: Draft = new Map<string, DraftKind>([["2026-07-25", "attend"]]);
    const next = applyKind(draft, ["2026-08-01"], "no");
    expect(next.has("2026-08-01")).toBe(false);
  });
});

describe("candidateWeeks / daysInWeek", () => {
  it("候補日を含む週(日曜起点)を昇順で返す", () => {
    // 2026-07-25(土) と 2026-07-26(日) は別週。次週は 2026-08-02(日)。
    const weeks = candidateWeeks(["2026-07-25", "2026-07-26", "2026-08-02"]);
    expect(weeks).toEqual(["2026-07-19", "2026-07-26", "2026-08-02"]);
  });

  it("同じ週の候補日をまとめ、昇順で返す", () => {
    const week = daysInWeek(
      ["2026-07-27", "2026-07-26", "2026-07-30"],
      "2026-07-26",
    );
    expect(week).toEqual(["2026-07-26", "2026-07-27", "2026-07-30"]);
  });
});

describe("draftDetailText / parseDraftDetail 往復", () => {
  it("例外を種別ごとに列挙し、同じ内容へ復元できる", () => {
    const draft: Draft = new Map<string, DraftKind>([
      ["2026-07-25", "attend"],
      ["2026-07-26", "no"],
      ["2026-07-27", "maybe"],
      ["2026-07-28", { startMinute: 1320 }],
      ["2026-07-29", "no"],
    ]);
    const text = draftDetailText(draft);
    const parsed = parseDraftDetail(text);
    expect(parsed.get("2026-07-26")).toBe("no");
    expect(parsed.get("2026-07-29")).toBe("no");
    expect(parsed.get("2026-07-27")).toBe("maybe");
    expect(parsed.get("2026-07-28")).toEqual({ startMinute: 1320 });
    // attend(参加可)は例外ではないので明細に出ない=parse に現れない
    expect(parsed.has("2026-07-25")).toBe(false);
  });

  it("例外が無ければ parse は空", () => {
    const draft: Draft = new Map<string, DraftKind>([["2026-07-25", "attend"]]);
    expect(parseDraftDetail(draftDetailText(draft)).size).toBe(0);
  });
});

describe("commitEntries", () => {
  it("全ての日付つき候補を optionId へ写す(attend→yes・残りは種別)", () => {
    const event = eventOf([
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]);
    const draft: Draft = new Map<string, DraftKind>([
      ["2026-07-25", "attend"],
      ["2026-07-26", "no"],
      ["2026-07-27", "maybe"],
      ["2026-07-28", { startMinute: 1320 }],
    ]);
    const entries = commitEntries(event, draft);
    const byCandidate = new Map(
      entries.map((e) => [e.candidateId, e.responseOptionId]),
    );
    expect(byCandidate.get("c-2026-07-25")).toBe("yes");
    expect(byCandidate.get("c-2026-07-26")).toBe("no");
    expect(byCandidate.get("c-2026-07-27")).toBe("maybe");
    expect(byCandidate.get("c-2026-07-28")).toBe("t22");
    expect(entries).toHaveLength(4);
  });

  it("日付なし候補はコミットしない(既存回答を壊さない)", () => {
    const event = eventOf(["2026-07-25", null]);
    const draft: Draft = new Map<string, DraftKind>([["2026-07-25", "attend"]]);
    const entries = commitEntries(event, draft);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.candidateId).toBe("c-2026-07-25");
  });
});
