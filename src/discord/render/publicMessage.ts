import {
  ActionRowBuilder,
  type BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { ScheduleSummary } from "../../domain/schedule/summary.js";
import { encodePanel } from "../customId.js";
import { formatEventHeading, formatSummaryLines } from "./summaryText.js";

// Discord の embed description 上限は 4096 文字。超える入力でも送信/更新が
// 失敗しないよう末尾を切り詰める。
const MAX_DESCRIPTION = 4096;

function truncate(text: string): string {
  return text.length <= MAX_DESCRIPTION
    ? text
    : `${text.slice(0, MAX_DESCRIPTION - 1)}…`;
}

/**
 * 公開メッセージ(集計 + 「回答する」ボタン)の payload を組み立てる。
 * channel.send / message.edit のどちらにも渡せる。
 */
export function renderPublicMessage(
  summary: ScheduleSummary,
): BaseMessageOptions {
  const event = summary.event;
  const lines = formatSummaryLines(summary);
  const body = [
    ...(event.description ? [event.description, ""] : []),
    ...lines,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setTitle(formatEventHeading(event))
    .setDescription(body.length > 0 ? truncate(body) : "候補がありません");

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
