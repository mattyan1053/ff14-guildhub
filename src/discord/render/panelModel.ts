import type { CandidateSummary } from "../../domain/schedule/summary.js";

export const PANEL_PAGE_SIZE = 4;

/** Math.ceil(total/size)。total=0 は 0。 */
export function pageCount(
  total: number,
  size: number = PANEL_PAGE_SIZE,
): number {
  return Math.ceil(total / size);
}

/** [0, max(0, pageCount-1)] にクランプ */
export function clampPage(
  page: number,
  total: number,
  size: number = PANEL_PAGE_SIZE,
): number {
  const max = Math.max(0, pageCount(total, size) - 1);
  if (page < 0) {
    return 0;
  }
  return page > max ? max : page;
}

/** 該当ページのスライス */
export function pageItems<T>(
  items: readonly T[],
  page: number,
  size: number = PANEL_PAGE_SIZE,
): T[] {
  const start = page * size;
  return items.slice(start, start + size);
}

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
