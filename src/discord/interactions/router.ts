import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  MessageFlags,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { decode } from "../customId.js";
import {
  BUILDER_CANCEL_BUTTON,
  BUILDER_DAY_PREFIX,
  BUILDER_PERIOD_BUTTON,
  BUILDER_PERIOD_MODAL,
  BUILDER_SET_TIMES_BUTTON,
  BUILDER_SET_TIMES_MODAL,
  BUILDER_SUBMIT_BUTTON,
  BUILDER_TITLE_BUTTON,
  BUILDER_TITLE_MODAL,
  BUILDER_WEEK_PREFIX,
} from "../render/createBuilder.js";
import {
  handleAnswer,
  handleBuilderCancel,
  handleBuilderDayToggle,
  handleBuilderPaging,
  handleBuilderPeriodButton,
  handleBuilderPeriodModal,
  handleBuilderSetTimesButton,
  handleBuilderSetTimesModal,
  handleBuilderSubmit,
  handleBuilderTitleButton,
  handleBuilderTitleModal,
  handleCreateCommand,
  handleList,
  handlePanelOpen,
  handlePanelPage,
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
  if (sub === "create") {
    await handleCreateCommand(interaction);
  } else if (sub === "list") {
    await handleList(interaction, deps);
  } else if (sub === "show") {
    await handleShow(interaction, deps);
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
  } else if (decoded?.action === "page") {
    await handlePanelPage(
      interaction,
      decoded.eventId,
      decoded.page ?? 0,
      deps,
    );
  }
}

async function routeSelect(
  interaction: StringSelectMenuInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const decoded = decode(interaction.customId);
  if (decoded?.action === "answer" && decoded.candidateId) {
    await handleAnswer(interaction, decoded.eventId, decoded.candidateId, deps);
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
