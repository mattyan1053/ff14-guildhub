import {
  ActionRowBuilder,
  type BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { PARTY_SIZE } from "../../domain/schedule/activity.js";
import type { ScheduleSummary } from "../../domain/schedule/summary.js";
import { encodePanel } from "../customId.js";
import {
  buildActivityCalendarFields,
  buildLegendField,
  formatNextActivityLine,
  formatTodayLine,
  hasDatedCandidates,
} from "./summaryCalendar.js";
import { formatEventHeading } from "./summaryText.js";

// Embed の description は 4096 / 1フィールドは 1024 文字上限。超えても送信/更新が
// 失敗しないよう末尾を切り詰める。
const MAX_DESCRIPTION = 4096;
const MAX_FIELD = 1024;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** イベント内でどれか1つでも候補に回答したユーザーIDを昇順で集める。 */
function collectRespondentIds(summary: ScheduleSummary): string[] {
  const ids = new Set<string>();
  for (const candidate of summary.candidates) {
    for (const tally of candidate.optionTallies) {
      for (const id of tally.respondentIds) {
        ids.add(id);
      }
    }
  }
  return [...ids].sort();
}

function respondersField(summary: ScheduleSummary): {
  name: string;
  value: string;
} {
  const ids = collectRespondentIds(summary);
  const value =
    ids.length > 0
      ? truncate(ids.map((id) => `<@${id}>`).join(" "), MAX_FIELD)
      : "まだ回答がありません";
  // 目標(フルパーティ)に対する到達度を N/8 で見せ、8人揃えば確定と各自判断できる。
  return { name: `回答済み (${ids.length}/${PARTY_SIZE}人)`, value };
}

/**
 * 公開メッセージの payload を組み立てる。
 * - description: 今日の活動有無と次回の活動日をテキストで強調(先頭に event.description)。
 * - fields: 活動カレンダー(開始時刻で色分け)+ 凡例 + 回答済みメンバー。
 * - 「回答する」ボタン。
 * channel.send / message.edit のどちらにも渡せる。now は今日/次回の基準時刻(既定=現在)。
 */
export function renderPublicMessage(
  summary: ScheduleSummary,
  now: Date = new Date(),
): BaseMessageOptions {
  const event = summary.event;
  const embed = new EmbedBuilder().setTitle(formatEventHeading(event));

  const descParts: string[] = [];
  if (event.description) {
    descParts.push(event.description);
  }
  if (hasDatedCandidates(summary)) {
    // 今日の活動有無は最重要なので見出し(##)で大きく強調する。色は絵文字で示す。
    descParts.push(`## ${formatTodayLine(summary, now)}`);
    descParts.push(formatNextActivityLine(summary, now));
  }
  if (descParts.length > 0) {
    embed.setDescription(truncate(descParts.join("\n"), MAX_DESCRIPTION));
  }

  const fields: { name: string; value: string }[] = [];
  const calendarFields = buildActivityCalendarFields(summary);
  if (calendarFields.length > 0) {
    fields.push(...calendarFields, buildLegendField(summary));
  }
  fields.push(respondersField(summary));
  embed.addFields(...fields);

  const button = new ButtonBuilder()
    .setCustomId(encodePanel(event.id))
    .setLabel("回答する")
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  return {
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: [] },
  };
}
