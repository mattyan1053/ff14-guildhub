import { describe, expect, it } from "vitest";
import type { Candidate } from "../../domain/schedule/scheduleEvent.js";
import type {
  CandidateSummary,
  OptionTally,
} from "../../domain/schedule/summary.js";
import {
  clampPage,
  currentAnswerOptionId,
  PANEL_PAGE_SIZE,
  pageCount,
  pageItems,
} from "./panelModel.js";

describe("PANEL_PAGE_SIZE", () => {
  it("既定ページサイズは4", () => {
    expect(PANEL_PAGE_SIZE).toBe(4);
  });
});

describe("pageCount", () => {
  it("端数を切り上げて総ページ数を返す", () => {
    expect(pageCount(4)).toBe(1);
    expect(pageCount(5)).toBe(2);
    expect(pageCount(8)).toBe(2);
    expect(pageCount(9)).toBe(3);
  });

  it("total=0のときは0ページ", () => {
    expect(pageCount(0)).toBe(0);
  });

  it("sizeを指定できる", () => {
    expect(pageCount(6, 3)).toBe(2);
  });
});

describe("clampPage", () => {
  it("負のページは0にクランプする", () => {
    expect(clampPage(-1, 5)).toBe(0);
  });

  it("最大ページ以上は最終ページindexにクランプする", () => {
    expect(clampPage(99, 5)).toBe(1);
  });

  it("範囲内のページはそのまま返す", () => {
    expect(clampPage(1, 8)).toBe(1);
  });
});

describe("pageItems", () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  it("既定サイズで該当ページをスライスする", () => {
    expect(pageItems(items, 1)).toEqual([4, 5, 6, 7]);
  });

  it("末尾ページは余った件数のみ返す", () => {
    expect(pageItems(items, 2)).toEqual([8]);
  });
});

function optionTally(
  responseOptionId: string,
  respondentIds: string[],
): OptionTally {
  return {
    responseOptionId,
    label: responseOptionId,
    kind: "yes",
    count: respondentIds.length,
    respondentIds,
  };
}

function candidateSummary(optionTallies: OptionTally[]): CandidateSummary {
  const candidate: Candidate = {
    id: "c1",
    label: "7/25(金)",
    startsAt: null,
    position: 0,
  };
  return {
    candidate,
    optionTallies,
    startTimes: [],
    anytimeCount: 0,
    maybeCount: 0,
    unavailableCount: 0,
  };
}

describe("currentAnswerOptionId", () => {
  it("回答者が含まれる選択肢のIDを返す", () => {
    const summary = candidateSummary([
      optionTally("yes", ["u1"]),
      optionTally("no", ["u2"]),
    ]);

    expect(currentAnswerOptionId(summary, "u1")).toBe("yes");
    expect(currentAnswerOptionId(summary, "u2")).toBe("no");
  });

  it("どの選択肢にもいなければnull", () => {
    const summary = candidateSummary([
      optionTally("yes", ["u1"]),
      optionTally("no", ["u2"]),
    ]);

    expect(currentAnswerOptionId(summary, "u3")).toBeNull();
  });
});
