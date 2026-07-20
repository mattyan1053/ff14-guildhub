import type {
  CandidateSummary,
  ScheduleSummary,
} from "../../domain/schedule/summary.js";

/** `📅 ${title}  #${guildSeq}` (半角スペース2つで区切り) */
export function formatEventHeading(event: {
  title: string;
  guildSeq: number;
}): string {
  return `📅 ${event.title}  #${event.guildSeq}`;
}

export function formatCandidateLine(candidate: CandidateSummary): string {
  const label = candidate.candidate.label;
  const tail = `未定${candidate.maybeCount} 不可${candidate.unavailableCount}`;
  if (candidate.startTimes.length > 0) {
    const times = candidate.startTimes
      .map((st) => `${st.label}${st.attendableCount}人`)
      .join("  ");
    return `${label}: ${times} / ${tail}`;
  }
  return `${label}: いつでも${candidate.anytimeCount}人 / ${tail}`;
}

export function formatSummaryLines(summary: ScheduleSummary): string[] {
  return summary.candidates.map(formatCandidateLine);
}
