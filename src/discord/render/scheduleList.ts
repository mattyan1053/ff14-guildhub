import {
  ActionRowBuilder,
  type BaseMessageOptions,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import type { ScheduleEventListItem } from "../../application/schedule/ports/scheduleRepository.js";
import { LIST_SELECT } from "../customId.js";

// StringSelect は最大25件。超える分は説明のコードブロック(番号一覧)で拾えるよう
// 案内する(番号で /schedule show できる)。
const MAX_SELECT_OPTIONS = 25;
// Embed description は 4096 / 選択肢ラベルは 100 文字上限。
const MAX_DESCRIPTION = 4096;
const MAX_OPTION_LABEL = 100;

function truncateBlock(lines: string[]): string {
  const body = lines.join("\n");
  const fence = 8; // "```\n" + "\n```"
  if (body.length + fence <= MAX_DESCRIPTION) {
    return `\`\`\`\n${body}\n\`\`\``;
  }
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 + fence > MAX_DESCRIPTION) {
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return `\`\`\`\n${kept.join("\n")}\n…\n\`\`\``;
}

function clampLabel(label: string): string {
  return label.length <= MAX_OPTION_LABEL
    ? label
    : `${label.slice(0, MAX_OPTION_LABEL - 1)}…`;
}

/**
 * /schedule list の payload(番号一覧の Embed + 選んで即表示する選択メニュー)。
 * items は連番の降順(新しいものが上)を前提にする。1件以上あることを呼び出し側が保証する。
 */
export function renderScheduleList(
  items: readonly ScheduleEventListItem[],
): BaseMessageOptions {
  const width = Math.max(...items.map((item) => String(item.guildSeq).length));
  const lines = items.map(
    (item) => `#${String(item.guildSeq).padStart(width, " ")}  ${item.title}`,
  );

  const embed = new EmbedBuilder()
    .setTitle(`📋 日程調整一覧 (${items.length}件)`)
    .setDescription(truncateBlock(lines));
  if (items.length > MAX_SELECT_OPTIONS) {
    embed.setFooter({
      text: `メニューには新しい ${MAX_SELECT_OPTIONS} 件のみ。それより前は /schedule show 番号 で表示できます。`,
    });
  }

  const options = items
    .slice(0, MAX_SELECT_OPTIONS)
    .map((item) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(clampLabel(`#${item.guildSeq} ${item.title}`))
        .setValue(item.id),
    );
  const menu = new StringSelectMenuBuilder()
    .setCustomId(LIST_SELECT)
    .setPlaceholder("日程を選んで表示...")
    .addOptions(options);
  const row =
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      menu,
    );

  return {
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: [] },
  };
}
