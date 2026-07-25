import type { CandidateSummary } from "../../domain/schedule/summary.js";

/**
 * candidate.optionTallies を走査し、respondentIds に userId を含む
 * optionTally の responseOptionId を返す。無ければ null。
 */
export function currentAnswerOptionId(
  candidate: CandidateSummary,
  userId: string,
): string | null {
  for (const tally of candidate.optionTallies) {
    if (tally.respondentIds.includes(userId)) {
      return tally.responseOptionId;
    }
  }
  return null;
}
