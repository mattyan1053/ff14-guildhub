import {
  ActionRowBuilder,
  type BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import type { ScheduleSummary } from "../../domain/schedule/summary.js";
import { encodeAnswer, encodePage } from "../customId.js";
import {
  clampPage,
  currentAnswerOptionId,
  pageCount,
  pageItems,
} from "./panelModel.js";

/**
 * 自分専用の回答パネル(候補ごとの状態 select + ページ送り)の payload を組み立てる。
 * ephemeral 返信 / interaction.update のどちらにも渡せる。
 */
export function renderAnswerPanel(
  summary: ScheduleSummary,
  userId: string,
  rawPage: number,
): BaseMessageOptions {
  const total = summary.candidates.length;
  const totalPages = Math.max(1, pageCount(total));
  const page = clampPage(rawPage, total);
  const eventId = summary.event.id;

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = pageItems(
    summary.candidates,
    page,
  ).map((candidate) => {
    const current = currentAnswerOptionId(candidate, userId);
    const options = summary.event.responseOptions.map((option) => {
      const builder = new StringSelectMenuOptionBuilder()
        .setLabel(option.label)
        .setValue(option.id);
      if (current === option.id) {
        builder.setDefault(true);
      }
      return builder;
    });
    const menu = new StringSelectMenuBuilder()
      .setCustomId(encodeAnswer(eventId, candidate.candidate.id))
      .setPlaceholder(candidate.candidate.label)
      .addOptions(options);
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      menu,
    );
  });

  const navRow =
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(encodePage(eventId, page - 1))
        .setLabel("◀ 前へ")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(encodePage(eventId, page + 1))
        .setLabel("次へ ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    );

  return {
    content: `回答パネル(${page + 1}/${totalPages}ページ)\n各候補で選ぶと即保存されます。`,
    components: [...rows, navRow],
    allowedMentions: { parse: [] },
  };
}
