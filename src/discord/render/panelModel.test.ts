import { describe, expect, it } from "vitest";
import type { Candidate } from "../../domain/schedule/scheduleEvent.js";
import type {
  CandidateSummary,
  OptionTally,
} from "../../domain/schedule/summary.js";
import { currentAnswerOptionId } from "./panelModel.js";

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
