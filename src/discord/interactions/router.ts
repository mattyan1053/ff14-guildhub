import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  MessageFlags,
  type StringSelectMenuInteraction,
} from "discord.js";
import { decode } from "../customId.js";
import { CREATE_MODAL_ID } from "./schedule/createModal.js";
import {
  handleAnswer,
  handleCreateCommand,
  handleCreateModal,
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
        if (interaction.customId === CREATE_MODAL_ID) {
          await handleCreateModal(interaction, deps);
        }
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
