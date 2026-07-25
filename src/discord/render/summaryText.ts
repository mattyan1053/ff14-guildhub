/** `📅 ${title}  #${guildSeq}` (半角スペース2つで区切り) */
export function formatEventHeading(event: {
  title: string;
  guildSeq: number;
}): string {
  return `📅 ${event.title}  #${event.guildSeq}`;
}
