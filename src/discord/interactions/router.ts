import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  MessageFlags,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { DELETE_CANCEL, decode, LIST_SELECT } from "../customId.js";
import {
  ANSWER_APPLY_PREFIX,
  ANSWER_CLOSE,
  ANSWER_DAY_PREFIX,
  ANSWER_DONE_PREFIX,
  ANSWER_WEEK_PREFIX,
} from "../render/answerPanel.js";
import {
  BUILDER_CANCEL_BUTTON,
  BUILDER_DAY_PREFIX,
  BUILDER_PERIOD_BUTTON,
  BUILDER_PERIOD_MODAL,
  BUILDER_REMIND_BUTTON,
  BUILDER_REMIND_MODAL,
  BUILDER_SET_TIMES_BUTTON,
  BUILDER_SET_TIMES_MODAL,
  BUILDER_SUBMIT_BUTTON,
  BUILDER_TITLE_BUTTON,
  BUILDER_TITLE_MODAL,
  BUILDER_WEEK_PREFIX,
} from "../render/createBuilder.js";
import {
  handleAnswerApply,
  handleAnswerClose,
  handleAnswerDay,
  handleAnswerDone,
  handleAnswerWeek,
  handleBuilderCancel,
  handleBuilderDayToggle,
  handleBuilderPaging,
  handleBuilderPeriodButton,
  handleBuilderPeriodModal,
  handleBuilderRemindButton,
  handleBuilderRemindModal,
  handleBuilderSetTimesButton,
  handleBuilderSetTimesModal,
  handleBuilderSubmit,
  handleBuilderTitleButton,
  handleBuilderTitleModal,
  handleCreateCommand,
  handleDelete,
  handleDeleteCancel,
  handleDeleteConfirm,
  handleList,
  handleListSelect,
  handlePanelOpen,
  handleRemindOff,
  handleRemindSet,
  handleRemindStatus,
  handleShow,
  type ScheduleInteractionDeps,
} from "./schedule/handlers.js";

async function routeCommand(
  interaction: ChatInputCommandInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  if (interaction.commandName !== "schedule") {
    return;
  }
  const sub = interaction.options.getSubcommand();
  if (interaction.options.getSubcommandGroup(false) === "remind") {
    if (sub === "set") {
      await handleRemindSet(interaction, deps);
    } else if (sub === "off") {
      await handleRemindOff(interaction, deps);
    } else if (sub === "status") {
      await handleRemindStatus(interaction, deps);
    }
    return;
  }
  if (sub === "create") {
    await handleCreateCommand(interaction);
  } else if (sub === "list") {
    await handleList(interaction, deps);
  } else if (sub === "show") {
    await handleShow(interaction, deps);
  } else if (sub === "delete") {
    await handleDelete(interaction, deps);
  }
}

async function routeButton(
  interaction: ButtonInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const id = interaction.customId;
  if (id.startsWith(BUILDER_DAY_PREFIX)) {
    await handleBuilderDayToggle(interaction);
    return;
  }
  if (id.startsWith(BUILDER_WEEK_PREFIX)) {
    await handleBuilderPaging(interaction);
    return;
  }
  if (id.startsWith(ANSWER_WEEK_PREFIX)) {
    await handleAnswerWeek(interaction, deps);
    return;
  }
  if (id.startsWith(ANSWER_DAY_PREFIX)) {
    await handleAnswerDay(interaction, deps);
    return;
  }
  if (id.startsWith(ANSWER_DONE_PREFIX)) {
    await handleAnswerDone(interaction, deps);
    return;
  }
  if (id === ANSWER_CLOSE) {
    await handleAnswerClose(interaction);
    return;
  }
  if (id === DELETE_CANCEL) {
    await handleDeleteCancel(interaction);
    return;
  }
  switch (id) {
    case BUILDER_PERIOD_BUTTON:
      await handleBuilderPeriodButton(interaction);
      return;
    case BUILDER_TITLE_BUTTON:
      await handleBuilderTitleButton(interaction);
      return;
    case BUILDER_SET_TIMES_BUTTON:
      await handleBuilderSetTimesButton(interaction);
      return;
    case BUILDER_REMIND_BUTTON:
      await handleBuilderRemindButton(interaction);
      return;
    case BUILDER_SUBMIT_BUTTON:
      await handleBuilderSubmit(interaction, deps);
      return;
    case BUILDER_CANCEL_BUTTON:
      await handleBuilderCancel(interaction);
      return;
    default:
      break;
  }

  const decoded = decode(interaction.customId);
  if (decoded?.action === "panel") {
    await handlePanelOpen(interaction, decoded.eventId, deps);
  } else if (decoded?.action === "delete") {
    await handleDeleteConfirm(interaction, decoded.eventId, deps);
  }
}

async function routeSelect(
  interaction: StringSelectMenuInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  if (interaction.customId === LIST_SELECT) {
    await handleListSelect(interaction, deps);
    return;
  }
  if (interaction.customId.startsWith(ANSWER_APPLY_PREFIX)) {
    await handleAnswerApply(interaction, deps);
  }
}

async function routeModal(interaction: ModalSubmitInteraction): Promise<void> {
  switch (interaction.customId) {
    case BUILDER_TITLE_MODAL:
      await handleBuilderTitleModal(interaction);
      return;
    case BUILDER_SET_TIMES_MODAL:
      await handleBuilderSetTimesModal(interaction);
      return;
    case BUILDER_PERIOD_MODAL:
      await handleBuilderPeriodModal(interaction);
      return;
    case BUILDER_REMIND_MODAL:
      await handleBuilderRemindModal(interaction);
      return;
    default:
      break;
  }
}

async function safeErrorReply(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable()) {
    return;
  }
  const payload = {
    content: "処理中にエラーが発生しました。",
    flags: MessageFlags.Ephemeral,
  } as const;
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // 応答済み/期限切れ等。これ以上できることはない。
  }
}

/**
 * InteractionCreate を種別で振り分ける。ハンドラは薄く保ち Use Case を呼ぶ。
 */
export function makeInteractionHandler(
  deps: ScheduleInteractionDeps,
): (interaction: Interaction) => Promise<void> {
  return async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await routeCommand(interaction, deps);
      } else if (interaction.isModalSubmit()) {
        await routeModal(interaction);
      } else if (interaction.isButton()) {
        await routeButton(interaction, deps);
      } else if (interaction.isStringSelectMenu()) {
        await routeSelect(interaction, deps);
      }
    } catch (error) {
      console.error(error);
      await safeErrorReply(interaction);
    }
  };
}
