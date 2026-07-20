import {
  ActionRowBuilder,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

export const CREATE_MODAL_ID = "sch:v1:create-modal";

export const FIELD_TITLE = "title";
export const FIELD_DESCRIPTION = "description";
export const FIELD_CANDIDATES = "candidates";
export const FIELD_TIME_SLOTS = "timeSlots";

function row(
  input: TextInputBuilder,
): ActionRowBuilder<ModalActionRowComponentBuilder> {
  return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    input,
  );
}

/** /schedule create のモーダルを組み立てる。 */
export function buildCreateModal(): ModalBuilder {
  const title = new TextInputBuilder()
    .setCustomId(FIELD_TITLE)
    .setLabel("タイトル")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);

  const description = new TextInputBuilder()
    .setCustomId(FIELD_DESCRIPTION)
    .setLabel("説明(任意)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const candidates = new TextInputBuilder()
    .setCustomId(FIELD_CANDIDATES)
    .setLabel("候補日(1行に1件)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("7/25(金)\n7/26(土)\n7/27(日)");

  const timeSlots = new TextInputBuilder()
    .setCustomId(FIELD_TIME_SLOTS)
    .setLabel("候補時刻(1行に1件・任意 例 21:00)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder("21:00\n21:30\n22:00");

  return new ModalBuilder()
    .setCustomId(CREATE_MODAL_ID)
    .setTitle("日程調整を作成")
    .addComponents(
      row(title),
      row(description),
      row(candidates),
      row(timeSlots),
    );
}
