import { describe, expect, it } from "vitest";
import { ScheduleValidationError } from "./errors.js";
import {
  type BuildScheduleEventParams,
  buildScheduleEvent,
  type CandidateSpec,
  type ResponseOptionSpec,
} from "./scheduleEvent.js";
import { MAX_CANDIDATES, MAX_LABEL_LENGTH } from "./validation.js";

/** 連番IDを返すフェイク。呼ばれるたび id-1, id-2, ... を返す。 */
function sequentialIds(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
}

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");

function fixedNow(): Date {
  return FIXED_NOW;
}

function candidate(label: string, startsAt: Date | null = null): CandidateSpec {
  return { label, startsAt };
}

const anytimeOption: ResponseOptionSpec = {
  label: "いつでも",
  kind: "yes",
  startMinute: null,
};
const unavailableOption: ResponseOptionSpec = {
  label: "不可",
  kind: "no",
  startMinute: null,
};

function params(
  overrides: Partial<BuildScheduleEventParams> = {},
): BuildScheduleEventParams {
  return {
    guildId: "guild-1",
    channelId: "channel-1",
    creatorId: "creator-1",
    guildSeq: 3,
    title: "固定活動の日程",
    description: null,
    candidates: [candidate("7/25(金)"), candidate("7/26(土)")],
    responseOptions: [anytimeOption, unavailableOption],
    ...overrides,
  };
}

describe("buildScheduleEvent", () => {
  it("基本フィールドを組み立てる(id/status/messageId/日時)", () => {
    const event = buildScheduleEvent(params(), {
      newId: sequentialIds(),
      now: fixedNow,
    });

    expect(event.id).toBe("id-1");
    expect(event.status).toBe("open");
    expect(event.messageId).toBeNull();
    expect(event.createdAt).toEqual(FIXED_NOW);
    expect(event.updatedAt).toEqual(FIXED_NOW);
    expect(event.guildId).toBe("guild-1");
    expect(event.channelId).toBe("channel-1");
    expect(event.creatorId).toBe("creator-1");
    expect(event.guildSeq).toBe(3);
    expect(event.title).toBe("固定活動の日程");
    expect(event.description).toBeNull();
  });

  it("候補と選択肢に0起点の position を採番する", () => {
    const event = buildScheduleEvent(params(), {
      newId: sequentialIds(),
      now: fixedNow,
    });

    expect(event.candidates.map((c) => c.position)).toEqual([0, 1]);
    expect(event.responseOptions.map((o) => o.position)).toEqual([0, 1]);
  });

  it("newId を呼び出し順に採番する(event→候補→選択肢)", () => {
    const event = buildScheduleEvent(params(), {
      newId: sequentialIds(),
      now: fixedNow,
    });

    expect(event.id).toBe("id-1");
    expect(event.candidates.map((c) => c.id)).toEqual(["id-2", "id-3"]);
    expect(event.responseOptions.map((o) => o.id)).toEqual(["id-4", "id-5"]);
  });

  it("候補のラベルと日付を保持する", () => {
    const startsAt = new Date("2026-07-25T12:00:00.000Z");
    const event = buildScheduleEvent(
      params({ candidates: [candidate("7/25(金)", startsAt)] }),
      { newId: sequentialIds(), now: fixedNow },
    );

    expect(event.candidates[0]?.label).toBe("7/25(金)");
    expect(event.candidates[0]?.startsAt).toEqual(startsAt);
  });

  it("タイトルがトリム後に空だとエラー", () => {
    expect(() =>
      buildScheduleEvent(params({ title: "   " }), {
        newId: sequentialIds(),
        now: fixedNow,
      }),
    ).toThrow(ScheduleValidationError);
  });

  it("候補が0件だとエラー", () => {
    expect(() =>
      buildScheduleEvent(params({ candidates: [] }), {
        newId: sequentialIds(),
        now: fixedNow,
      }),
    ).toThrow(ScheduleValidationError);
  });

  it("候補が MAX_CANDIDATES を超えるとエラー", () => {
    const tooMany = Array.from({ length: MAX_CANDIDATES + 1 }, (_, i) =>
      candidate(`day-${i}`),
    );

    expect(() =>
      buildScheduleEvent(params({ candidates: tooMany }), {
        newId: sequentialIds(),
        now: fixedNow,
      }),
    ).toThrow(ScheduleValidationError);
  });

  it("候補がちょうど MAX_CANDIDATES 件なら通る(境界)", () => {
    const exactly = Array.from({ length: MAX_CANDIDATES }, (_, i) =>
      candidate(`day-${i}`),
    );

    const event = buildScheduleEvent(params({ candidates: exactly }), {
      newId: sequentialIds(),
      now: fixedNow,
    });

    expect(event.candidates).toHaveLength(MAX_CANDIDATES);
  });

  it("選択肢が1件未満(0件)だとエラー", () => {
    expect(() =>
      buildScheduleEvent(params({ responseOptions: [] }), {
        newId: sequentialIds(),
        now: fixedNow,
      }),
    ).toThrow(ScheduleValidationError);
  });

  it("ラベルが MAX_LABEL_LENGTH を超えるとエラー", () => {
    const longLabel = "あ".repeat(MAX_LABEL_LENGTH + 1);

    expect(() =>
      buildScheduleEvent(params({ candidates: [candidate(longLabel)] }), {
        newId: sequentialIds(),
        now: fixedNow,
      }),
    ).toThrow(ScheduleValidationError);
  });

  it("ラベルがちょうど MAX_LABEL_LENGTH 文字なら通る(境界)", () => {
    const label = "あ".repeat(MAX_LABEL_LENGTH);

    const event = buildScheduleEvent(
      params({ candidates: [candidate(label)] }),
      { newId: sequentialIds(), now: fixedNow },
    );

    expect(event.candidates[0]?.label).toBe(label);
  });

  it("kind が time なのに startMinute が null だとエラー", () => {
    const broken: ResponseOptionSpec = {
      label: "21:00〜",
      kind: "time",
      startMinute: null,
    };

    expect(() =>
      buildScheduleEvent(
        params({ responseOptions: [anytimeOption, broken, unavailableOption] }),
        { newId: sequentialIds(), now: fixedNow },
      ),
    ).toThrow(ScheduleValidationError);
  });

  it("kind が time 以外なのに startMinute が非null だとエラー", () => {
    const broken: ResponseOptionSpec = {
      label: "いつでも",
      kind: "yes",
      startMinute: 0,
    };

    expect(() =>
      buildScheduleEvent(
        params({ responseOptions: [broken, unavailableOption] }),
        { newId: sequentialIds(), now: fixedNow },
      ),
    ).toThrow(ScheduleValidationError);
  });
});
