import {
  ActionRowBuilder,
  type BaseMessageOptions,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  MessageFlags,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  type StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { makeAddResponse } from "../../../application/schedule/addResponse.js";
import type { makeAttachScheduleMessage } from "../../../application/schedule/attachScheduleMessage.js";
import type { makeCreateScheduleEvent } from "../../../application/schedule/createScheduleEvent.js";
import type { makeGetScheduleSummary } from "../../../application/schedule/getScheduleSummary.js";
import type { makeListScheduleEvents } from "../../../application/schedule/listScheduleEvents.js";
import type { makeShowScheduleEvent } from "../../../application/schedule/showScheduleEvent.js";
import {
  datesBetween,
  weekWindow,
} from "../../../domain/schedule/datePresets.js";
import { ScheduleValidationError } from "../../../domain/schedule/errors.js";
import { MAX_CANDIDATES } from "../../../domain/schedule/limits.js";
import type { ScheduleSummary } from "../../../domain/schedule/summary.js";
import { parseTimeSlots } from "../../../domain/schedule/validation.js";
import { SHOW_OPTION_NUMBER } from "../../commands/schedule.js";
import { renderAnswerPanel } from "../../render/answerPanel.js";
import {
  BUILDER_DAY_PREFIX,
  BUILDER_PERIOD_MODAL,
  BUILDER_SET_TIMES_MODAL,
  BUILDER_TITLE_MODAL,
  BUILDER_WEEK_PREFIX,
  type BuilderState,
  builderStateToCreateInput,
  parseBuilderState,
  renderCreateBuilder,
} from "../../render/createBuilder.js";
import { PANEL_PAGE_SIZE } from "../../render/panelModel.js";
import { renderPublicMessage } from "../../render/publicMessage.js";

export interface ScheduleInteractionDeps {
  createScheduleEvent: ReturnType<typeof makeCreateScheduleEvent>;
  addResponse: ReturnType<typeof makeAddResponse>;
  getScheduleSummary: ReturnType<typeof makeGetScheduleSummary>;
  attachScheduleMessage: ReturnType<typeof makeAttachScheduleMessage>;
  listScheduleEvents: ReturnType<typeof makeListScheduleEvents>;
  showScheduleEvent: ReturnType<typeof makeShowScheduleEvent>;
}

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;
const MAX_CONTENT = 1900;

const FIELD_TITLE = "title";
const FIELD_DESCRIPTION = "description";
const FIELD_TIMES = "times";
const FIELD_PERIOD_START = "start";
const FIELD_PERIOD_END = "end";

/** 分(0..1439)を "HH:MM" に整形する。 */
function minutesToHhmm(startMinute: number): string {
  const hh = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const mm = String(startMinute % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ScheduleValidationError) {
    return `入力を確認してください:\n${error.issues.map((i) => `・${i}`).join("\n")}`;
  }
  return "処理中にエラーが発生しました。";
}

/**
 * channelId からチャンネルを解決する。interaction.channel はキャッシュ依存で
 * 正常なギルドチャンネルでも null になりうるため、常に fetch で取得する。
 */
async function fetchChannel(client: Client, channelId: string) {
  try {
    return await client.channels.fetch(channelId);
  } catch {
    return null;
  }
}

function truncateLines(lines: string[]): string {
  const content = lines.join("\n");
  if (content.length <= MAX_CONTENT) {
    return content;
  }
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > MAX_CONTENT) {
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return `${kept.join("\n")}\n…他 ${lines.length - kept.length} 件(番号で /schedule show してください)`;
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
  client: Client,
  summary: ScheduleSummary,
): Promise<void> {
  const { messageId, channelId } = summary.event;
  if (!messageId) {
    return;
  }
  const channel = await fetchChannel(client, channelId);
  if (!channel?.isTextBased()) {
    return;
  }
  try {
    const message = await channel.messages.fetch(messageId);
    await message.edit(renderPublicMessage(summary));
  } catch {
    // メッセージが削除された等。/schedule show で再表示できるので無視する。
  }
}

// ── 作成ビルダー ─────────────────────────────────────────────

/** interaction が持つメッセージからビルダー状態を復元する(パネル自身が真実源)。 */
function stateFromMessage(
  message: {
    embeds: unknown;
    components: unknown;
  } | null,
): BuilderState | null {
  if (!message) {
    return null;
  }
  return parseBuilderState({
    embeds: message.embeds,
    components: message.components,
  } as unknown as BaseMessageOptions);
}

// 週めくりで進める上限(今週=0 から約8週先まで)。
const MAX_WEEK_OFFSET = 8;

/** 指定した週の7日を DayOption 化し、ページング可否とともに state へ反映する。 */
function withWeek(state: BuilderState, offset: number): BuilderState {
  return {
    ...state,
    weekOffset: offset,
    canPrev: offset > 0,
    canNext: offset < MAX_WEEK_OFFSET,
    weekDays: weekWindow(new Date(), offset).map((preset) => ({
      value: preset.value,
      label: preset.label,
    })),
  };
}

function initialBuilderState(now: Date): BuilderState {
  return {
    title: null,
    description: null,
    weekOffset: 0,
    canPrev: false,
    canNext: MAX_WEEK_OFFSET > 0,
    weekDays: weekWindow(now, 0).map((preset) => ({
      value: preset.value,
      label: preset.label,
    })),
    selectedDates: [],
    timeSlots: [],
  };
}

function textRow(
  input: TextInputBuilder,
): ActionRowBuilder<ModalActionRowComponentBuilder> {
  return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    input,
  );
}

export async function handleCreateCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってください。",
      ...EPHEMERAL,
    });
    return;
  }
  // 作成のみ ManageEvents で絞る(list/show は誰でも可)。
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageEvents)) {
    await interaction.reply({
      content: "この操作には「イベントの管理」権限が必要です。",
      ...EPHEMERAL,
    });
    return;
  }
  await interaction.reply({
    ...renderCreateBuilder(initialBuilderState(new Date())),
    ...EPHEMERAL,
  });
}

/** 日ボタン。押した日を候補日に追加/除外(1日トグル)する。 */
export async function handleBuilderDayToggle(
  interaction: ButtonInteraction,
): Promise<void> {
  const state = stateFromMessage(interaction.message);
  if (!state) {
    await interaction.deferUpdate();
    return;
  }
  const value = interaction.customId.slice(BUILDER_DAY_PREFIX.length);
  const has = state.selectedDates.includes(value);
  if (!has && state.selectedDates.length >= MAX_CANDIDATES) {
    await interaction.reply({
      content: `候補日はこれ以上追加できません(最大 ${MAX_CANDIDATES} 件)。`,
      ...EPHEMERAL,
    });
    return;
  }
  // YYYY-MM-DD は辞書順=日付順なので昇順に保つ。
  const selectedDates = has
    ? state.selectedDates.filter((date) => date !== value)
    : [...state.selectedDates, value].sort();
  await interaction.update(renderCreateBuilder({ ...state, selectedDates }));
}

/** 前週/次週ボタン。表示する週を切り替える(選択済みは保持)。 */
export async function handleBuilderPaging(
  interaction: ButtonInteraction,
): Promise<void> {
  const state = stateFromMessage(interaction.message);
  if (!state) {
    await interaction.deferUpdate();
    return;
  }
  const target = Number(interaction.customId.slice(BUILDER_WEEK_PREFIX.length));
  const offset = Math.min(
    Math.max(0, Number.isFinite(target) ? target : 0),
    MAX_WEEK_OFFSET,
  );
  await interaction.update(renderCreateBuilder(withWeek(state, offset)));
}

/** 「期間を設定」ボタン → 開始/終了日のモーダルを開く(既定は翌日)。 */
export async function handleBuilderPeriodButton(
  interaction: ButtonInteraction,
): Promise<void> {
  // 翌日 = 今日起点の週窓の2件目。
  const tomorrow = weekWindow(new Date(), 0)[1]?.value ?? "";
  const field = (customId: string, label: string): TextInputBuilder =>
    new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(10)
      .setPlaceholder("2026-07-22")
      .setValue(tomorrow);
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(BUILDER_PERIOD_MODAL)
      .setTitle("期間を設定(YYYY-MM-DD)")
      .addComponents(
        textRow(field(FIELD_PERIOD_START, "開始日")),
        textRow(field(FIELD_PERIOD_END, "終了日")),
      ),
  );
}

/** 期間モーダルの送信 → 開始〜終了の全日を候補日に加える。 */
export async function handleBuilderPeriodModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.isFromMessage()) {
    return;
  }
  const state = stateFromMessage(interaction.message);
  if (!state) {
    await interaction.deferUpdate();
    return;
  }
  const start = interaction.fields.getTextInputValue(FIELD_PERIOD_START).trim();
  const end = interaction.fields.getTextInputValue(FIELD_PERIOD_END).trim();
  const range = datesBetween(start, end);
  if (range.length === 0) {
    await interaction.reply({
      content: "日付は YYYY-MM-DD で入力してください(例 2026-07-22)。",
      ...EPHEMERAL,
    });
    return;
  }
  const union = new Set([...state.selectedDates, ...range]);
  if (union.size > MAX_CANDIDATES) {
    await interaction.reply({
      content: `候補日は最大 ${MAX_CANDIDATES} 件までです(この範囲は ${union.size} 件)。`,
      ...EPHEMERAL,
    });
    return;
  }
  await interaction.update(
    renderCreateBuilder({ ...state, selectedDates: [...union].sort() }),
  );
}

/** 「タイトル/説明」ボタン → 現在値をプリフィルしたモーダルを開く。 */
export async function handleBuilderTitleButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const state = stateFromMessage(interaction.message);
  const title = new TextInputBuilder()
    .setCustomId(FIELD_TITLE)
    .setLabel("タイトル")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80)
    .setValue(state?.title ?? "");
  const description = new TextInputBuilder()
    .setCustomId(FIELD_DESCRIPTION)
    .setLabel("説明(任意)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setValue(state?.description ?? "");
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(BUILDER_TITLE_MODAL)
      .setTitle("タイトルと説明")
      .addComponents(textRow(title), textRow(description)),
  );
}

/** 「時刻を設定」ボタン → 現在の時刻を入れた複数行モーダルを開く。 */
export async function handleBuilderSetTimesButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const state = stateFromMessage(interaction.message);
  const input = new TextInputBuilder()
    .setCustomId(FIELD_TIMES)
    .setLabel("候補時刻(1行に1件・空で時刻なし)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder("21:00\n22:00")
    .setValue((state?.timeSlots ?? []).join("\n"));
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(BUILDER_SET_TIMES_MODAL)
      .setTitle("候補時刻を設定")
      .addComponents(textRow(input)),
  );
}

/** タイトル/説明モーダルの送信を反映する。 */
export async function handleBuilderTitleModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.isFromMessage()) {
    return;
  }
  const state = stateFromMessage(interaction.message);
  if (!state) {
    await interaction.deferUpdate();
    return;
  }
  const title = interaction.fields.getTextInputValue(FIELD_TITLE).trim();
  const description = interaction.fields
    .getTextInputValue(FIELD_DESCRIPTION)
    .trim();
  const next: BuilderState = {
    ...state,
    title: title.length > 0 ? title : null,
    description: description.length > 0 ? description : null,
  };
  await interaction.update(renderCreateBuilder(next));
}

/** 「時刻を設定」モーダルの送信を反映する(複数行を解析して置き換え)。 */
export async function handleBuilderSetTimesModal(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.isFromMessage()) {
    return;
  }
  const state = stateFromMessage(interaction.message);
  if (!state) {
    await interaction.deferUpdate();
    return;
  }
  const lines = interaction.fields.getTextInputValue(FIELD_TIMES).split("\n");
  let timeSlots: string[];
  try {
    timeSlots = parseTimeSlots(lines).map((slot) =>
      minutesToHhmm(slot.startMinute),
    );
  } catch (error) {
    // 不正な時刻はパネルを残したままエラーだけ知らせる。
    await interaction.reply({ content: errorMessage(error), ...EPHEMERAL });
    return;
  }
  await interaction.update(renderCreateBuilder({ ...state, timeSlots }));
}

/** キャンセルボタン。パネルを畳む。 */
export async function handleBuilderCancel(
  interaction: ButtonInteraction,
): Promise<void> {
  await interaction.update({
    content: "作成をキャンセルしました。",
    embeds: [],
    components: [],
  });
}

/** 「作成」ボタン。選択済みの内容でイベントを作り、公開メッセージを投稿する。 */
export async function handleBuilderSubmit(
  interaction: ButtonInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const channelId = interaction.channelId;
  const state = stateFromMessage(interaction.message);
  if (!interaction.inGuild() || channelId === null || !state) {
    await interaction.reply({
      content: "サーバー内のテキストチャンネルで使ってください。",
      ...EPHEMERAL,
    });
    return;
  }

  await interaction.deferUpdate();
  const input = builderStateToCreateInput(state);

  let summary: ScheduleSummary | null;
  let guildSeq: number;
  try {
    const { event } = await deps.createScheduleEvent({
      guildId: interaction.guildId,
      channelId,
      creatorId: interaction.user.id,
      title: input.title,
      description: input.description,
      candidateLines: input.candidateLines,
      timeSlotLines: input.timeSlotLines,
      candidateStartsAt: input.candidateStartsAt,
    });
    guildSeq = event.guildSeq;
    summary = await deps.getScheduleSummary({ eventId: event.id });
  } catch (error) {
    // パネルは残したまま、追加のエフェメラルでエラーを知らせて直せるようにする。
    await interaction.followUp({ content: errorMessage(error), ...EPHEMERAL });
    return;
  }
  if (!summary) {
    await interaction.followUp({
      content: "作成に失敗しました。",
      ...EPHEMERAL,
    });
    return;
  }

  const channel = await fetchChannel(interaction.client, channelId);
  if (!channel?.isSendable()) {
    await interaction.editReply({
      content: `作成しました(#${guildSeq})が、このチャンネルには投稿できませんでした。ボットにチャンネルの閲覧・送信権限があるか確認してください。`,
      embeds: [],
      components: [],
    });
    return;
  }
  try {
    const message = await channel.send(renderPublicMessage(summary));
    await deps.attachScheduleMessage({
      eventId: summary.event.id,
      messageId: message.id,
    });
    await interaction.editReply({
      content: `作成しました(#${guildSeq})。`,
      embeds: [],
      components: [],
    });
  } catch {
    await interaction.editReply({
      content: `作成しました(#${guildSeq})が投稿に失敗しました。/schedule show ${guildSeq} で再表示できます。`,
      embeds: [],
      components: [],
    });
  }
}

// ── 回答パネル ─────────────────────────────────────────────

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
  await updatePublicMessage(interaction.client, summary);
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
  await interaction.reply({ content: truncateLines(lines), ...EPHEMERAL });
}

export async function handleShow(
  interaction: ChatInputCommandInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const channelId = interaction.channelId;
  if (!interaction.inGuild() || channelId === null) {
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
  const channel = await fetchChannel(interaction.client, channelId);
  if (!channel?.isSendable()) {
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
