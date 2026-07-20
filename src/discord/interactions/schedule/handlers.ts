import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { makeAddResponse } from "../../../application/schedule/addResponse.js";
import type { makeAttachScheduleMessage } from "../../../application/schedule/attachScheduleMessage.js";
import type { makeCreateScheduleEvent } from "../../../application/schedule/createScheduleEvent.js";
import type { makeGetScheduleSummary } from "../../../application/schedule/getScheduleSummary.js";
import type { makeListScheduleEvents } from "../../../application/schedule/listScheduleEvents.js";
import type { makeShowScheduleEvent } from "../../../application/schedule/showScheduleEvent.js";
import { ScheduleValidationError } from "../../../domain/schedule/errors.js";
import type { ScheduleSummary } from "../../../domain/schedule/summary.js";
import { SHOW_OPTION_NUMBER } from "../../commands/schedule.js";
import { renderAnswerPanel } from "../../render/answerPanel.js";
import { PANEL_PAGE_SIZE } from "../../render/panelModel.js";
import { renderPublicMessage } from "../../render/publicMessage.js";
import {
  buildCreateModal,
  FIELD_CANDIDATES,
  FIELD_DESCRIPTION,
  FIELD_TIME_SLOTS,
  FIELD_TITLE,
} from "./createModal.js";

export interface ScheduleInteractionDeps {
  createScheduleEvent: ReturnType<typeof makeCreateScheduleEvent>;
  addResponse: ReturnType<typeof makeAddResponse>;
  getScheduleSummary: ReturnType<typeof makeGetScheduleSummary>;
  attachScheduleMessage: ReturnType<typeof makeAttachScheduleMessage>;
  listScheduleEvents: ReturnType<typeof makeListScheduleEvents>;
  showScheduleEvent: ReturnType<typeof makeShowScheduleEvent>;
}

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

function errorMessage(error: unknown): string {
  if (error instanceof ScheduleValidationError) {
    return `入力を確認してください:\n${error.issues.map((i) => `・${i}`).join("\n")}`;
  }
  return "処理中にエラーが発生しました。";
}

function pageOfCandidate(
  summary: ScheduleSummary,
  candidateId: string,
): number {
  const index = summary.candidates.findIndex(
    (c) => c.candidate.id === candidateId,
  );
  return index < 0 ? 0 : Math.floor(index / PANEL_PAGE_SIZE);
}

/** 公開メッセージを最新の集計で編集する(消えていても無視する)。 */
async function updatePublicMessage(
  interaction: StringSelectMenuInteraction,
  summary: ScheduleSummary,
): Promise<void> {
  const messageId = summary.event.messageId;
  const channel = interaction.channel;
  if (!messageId || !channel?.isTextBased()) {
    return;
  }
  try {
    const message = await channel.messages.fetch(messageId);
    await message.edit(renderPublicMessage(summary));
  } catch {
    // メッセージが削除された等。/schedule show で再表示できるので無視する。
  }
}

export async function handleCreateCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.showModal(buildCreateModal());
}

export async function handleCreateModal(
  interaction: ModalSubmitInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const channelId = interaction.channelId;
  if (!interaction.inGuild() || !interaction.channel || channelId === null) {
    await interaction.reply({
      content: "サーバー内のテキストチャンネルで使ってください。",
      ...EPHEMERAL,
    });
    return;
  }

  const description = interaction.fields
    .getTextInputValue(FIELD_DESCRIPTION)
    .trim();
  await interaction.deferReply(EPHEMERAL);

  let summary: ScheduleSummary | null;
  let guildSeq: number;
  try {
    const { event } = await deps.createScheduleEvent({
      guildId: interaction.guildId,
      channelId,
      creatorId: interaction.user.id,
      title: interaction.fields.getTextInputValue(FIELD_TITLE),
      description: description.length > 0 ? description : null,
      candidateLines: interaction.fields
        .getTextInputValue(FIELD_CANDIDATES)
        .split("\n"),
      timeSlotLines: interaction.fields
        .getTextInputValue(FIELD_TIME_SLOTS)
        .split("\n"),
    });
    guildSeq = event.guildSeq;
    summary = await deps.getScheduleSummary({ eventId: event.id });
  } catch (error) {
    await interaction.editReply({ content: errorMessage(error) });
    return;
  }
  if (!summary) {
    await interaction.editReply({ content: "作成に失敗しました。" });
    return;
  }

  const channel = interaction.channel;
  if (!channel.isSendable()) {
    await interaction.editReply({
      content: `作成しました(#${guildSeq})が、このチャンネルには投稿できませんでした。`,
    });
    return;
  }
  try {
    const message = await channel.send(renderPublicMessage(summary));
    await deps.attachScheduleMessage({
      eventId: summary.event.id,
      messageId: message.id,
    });
    await interaction.editReply({ content: `作成しました(#${guildSeq})。` });
  } catch {
    await interaction.editReply({
      content: `作成しました(#${guildSeq})が投稿に失敗しました。/schedule show ${guildSeq} で再表示できます。`,
    });
  }
}

export async function handlePanelOpen(
  interaction: ButtonInteraction,
  eventId: string,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const summary = await deps.getScheduleSummary({ eventId });
  if (!summary) {
    await interaction.reply({
      content: "この日程調整は見つかりませんでした。",
      ...EPHEMERAL,
    });
    return;
  }
  await interaction.reply({
    ...renderAnswerPanel(summary, interaction.user.id, 0),
    ...EPHEMERAL,
  });
}

export async function handlePanelPage(
  interaction: ButtonInteraction,
  eventId: string,
  page: number,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const summary = await deps.getScheduleSummary({ eventId });
  if (!summary) {
    await interaction.update({
      content: "見つかりませんでした。",
      components: [],
    });
    return;
  }
  await interaction.update(
    renderAnswerPanel(summary, interaction.user.id, page),
  );
}

export async function handleAnswer(
  interaction: StringSelectMenuInteraction,
  eventId: string,
  candidateId: string,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const optionId = interaction.values[0];
  if (!optionId) {
    await interaction.deferUpdate();
    return;
  }

  let summary: ScheduleSummary;
  try {
    const result = await deps.addResponse({
      eventId,
      candidateId,
      responseOptionId: optionId,
      userId: interaction.user.id,
    });
    summary = result.summary;
  } catch (error) {
    await interaction.reply({ content: errorMessage(error), ...EPHEMERAL });
    return;
  }

  await interaction.update(
    renderAnswerPanel(
      summary,
      interaction.user.id,
      pageOfCandidate(summary, candidateId),
    ),
  );
  await updatePublicMessage(interaction, summary);
}

export async function handleList(
  interaction: ChatInputCommandInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってください。",
      ...EPHEMERAL,
    });
    return;
  }
  const items = await deps.listScheduleEvents({ guildId: interaction.guildId });
  if (items.length === 0) {
    await interaction.reply({
      content: "まだ日程調整はありません。/schedule create で作成できます。",
      ...EPHEMERAL,
    });
    return;
  }
  const lines = items.map((item) => `#${item.guildSeq}  ${item.title}`);
  await interaction.reply({ content: lines.join("\n"), ...EPHEMERAL });
}

export async function handleShow(
  interaction: ChatInputCommandInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.channel) {
    await interaction.reply({
      content: "サーバー内で使ってください。",
      ...EPHEMERAL,
    });
    return;
  }
  const guildSeq = interaction.options.getInteger(SHOW_OPTION_NUMBER, true);
  await interaction.deferReply(EPHEMERAL);

  const summary = await deps.showScheduleEvent({
    guildId: interaction.guildId,
    guildSeq,
  });
  if (!summary) {
    await interaction.editReply({
      content: `#${guildSeq} は見つかりませんでした。`,
    });
    return;
  }
  const channel = interaction.channel;
  if (!channel.isSendable()) {
    await interaction.editReply({
      content: "このチャンネルには投稿できませんでした。",
    });
    return;
  }
  const message = await channel.send(renderPublicMessage(summary));
  await deps.attachScheduleMessage({
    eventId: summary.event.id,
    messageId: message.id,
  });
  await interaction.editReply({ content: `#${guildSeq} を再表示しました。` });
}
