import {
  ActionRowBuilder,
  type BaseMessageOptions,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Client,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  type StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { makeAddResponses } from "../../../application/schedule/addResponses.js";
import type { makeAttachScheduleMessage } from "../../../application/schedule/attachScheduleMessage.js";
import type { makeCreateScheduleEvent } from "../../../application/schedule/createScheduleEvent.js";
import type { makeDeleteScheduleEvent } from "../../../application/schedule/deleteScheduleEvent.js";
import type { makeGetScheduleEventByNumber } from "../../../application/schedule/getScheduleEventByNumber.js";
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
import { hhmm } from "../../../domain/schedule/time.js";
import { parseTimeSlots } from "../../../domain/schedule/validation.js";
import {
  DELETE_OPTION_NUMBER,
  SHOW_OPTION_NUMBER,
} from "../../commands/schedule.js";
import { DELETE_CANCEL, encodeDeleteConfirm } from "../../customId.js";
import {
  ANSWER_APPLY_PREFIX,
  ANSWER_DAY_PREFIX,
  ANSWER_DONE_PREFIX,
  ANSWER_WEEK_PREFIX,
  initialDraft,
  parseAnswerPanel,
  parseApplyValue,
  renderAnswerPanel,
  renderInitialAnswerPanel,
} from "../../render/answerPanel.js";
import { applyKind, commitEntries } from "../../render/answerPanelModel.js";
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
import { renderPublicMessage } from "../../render/publicMessage.js";
import { renderScheduleList } from "../../render/scheduleList.js";

export interface ScheduleInteractionDeps {
  createScheduleEvent: ReturnType<typeof makeCreateScheduleEvent>;
  addResponses: ReturnType<typeof makeAddResponses>;
  getScheduleSummary: ReturnType<typeof makeGetScheduleSummary>;
  attachScheduleMessage: ReturnType<typeof makeAttachScheduleMessage>;
  listScheduleEvents: ReturnType<typeof makeListScheduleEvents>;
  showScheduleEvent: ReturnType<typeof makeShowScheduleEvent>;
  getScheduleEventByNumber: ReturnType<typeof makeGetScheduleEventByNumber>;
  deleteScheduleEvent: ReturnType<typeof makeDeleteScheduleEvent>;
}

const EPHEMERAL = { flags: MessageFlags.Ephemeral } as const;

const FIELD_TITLE = "title";
const FIELD_DESCRIPTION = "description";
const FIELD_TIMES = "times";
const FIELD_PERIOD_START = "start";
const FIELD_PERIOD_END = "end";

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

/** 公開メッセージを削除する(best-effort。既に消えている/権限が無い等は無視する)。 */
async function deletePublicMessage(
  client: Client,
  channelId: string,
  messageId: string | null,
): Promise<void> {
  if (!messageId) {
    return;
  }
  const channel = await fetchChannel(client, channelId);
  if (!channel?.isTextBased()) {
    return;
  }
  try {
    const message = await channel.messages.fetch(messageId);
    await message.delete();
  } catch {
    // 既に削除済み・権限不足等。DB 側の削除は確定しているので無視する。
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
    timeSlots = parseTimeSlots(lines).map((slot) => hhmm(slot.startMinute));
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

/** eventId を末尾に持つ custom_id から eventId を取り出す(週ナビは ":index" を除く)。 */
function eventIdFromSuffix(customId: string, prefix: string): string {
  return customId.slice(prefix.length).split(":")[0] ?? "";
}

/** 「回答する」ボタン → 自分の下書きパネル(既存回答を反映)を開く。 */
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
  const draft = initialDraft(summary, interaction.user.id);
  if (draft.size === 0) {
    // 日付つき候補が無い(旧データ等)。カレンダーパネルは日付候補前提のため出せない。
    await interaction.reply({
      content:
        "この日程調整には日付つきの候補がないため、パネルで回答できません。",
      ...EPHEMERAL,
    });
    return;
  }
  await interaction.reply({
    ...renderInitialAnswerPanel(summary.event, draft),
    ...EPHEMERAL,
  });
}

/** 週ナビ。表示中の週を切り替える(下書きは保持、選択はクリア)。 */
export async function handleAnswerWeek(
  interaction: ButtonInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const eventId = eventIdFromSuffix(interaction.customId, ANSWER_WEEK_PREFIX);
  const target = Number(interaction.customId.split(":").at(-1));
  const summary = await deps.getScheduleSummary({ eventId });
  if (!summary) {
    await interaction.update({
      content: "見つかりませんでした。",
      components: [],
    });
    return;
  }
  const { draft } = parseAnswerPanel(interaction.message, summary.event);
  const weekIndex = Number.isFinite(target) ? target : 0;
  await interaction.update(
    renderAnswerPanel(summary.event, draft, weekIndex, []),
  );
}

/** 日ボタン。適用対象の日をトグル選択する(下書き・週は保持)。 */
export async function handleAnswerDay(
  interaction: ButtonInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const eventId = eventIdFromSuffix(interaction.customId, ANSWER_DAY_PREFIX);
  const dateValue =
    interaction.customId.slice(ANSWER_DAY_PREFIX.length).split(":")[1] ?? "";
  const summary = await deps.getScheduleSummary({ eventId });
  if (!summary) {
    await interaction.update({
      content: "見つかりませんでした。",
      components: [],
    });
    return;
  }
  const { draft, weekIndex, selectedDates } = parseAnswerPanel(
    interaction.message,
    summary.event,
  );
  const next = selectedDates.includes(dateValue)
    ? selectedDates.filter((v) => v !== dateValue)
    : [...selectedDates, dateValue];
  await interaction.update(
    renderAnswerPanel(summary.event, draft, weekIndex, next),
  );
}

/** 適用select。選択中の日にまとめて種別を適用する(DB保存はしない=下書きのみ)。 */
export async function handleAnswerApply(
  interaction: StringSelectMenuInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const eventId = eventIdFromSuffix(interaction.customId, ANSWER_APPLY_PREFIX);
  const kind = parseApplyValue(interaction.values[0] ?? "");
  const summary = await deps.getScheduleSummary({ eventId });
  if (!summary || !kind) {
    await interaction.deferUpdate();
    return;
  }
  const { draft, weekIndex, selectedDates } = parseAnswerPanel(
    interaction.message,
    summary.event,
  );
  const next = applyKind(draft, selectedDates, kind);
  // 適用後は選択をクリアして次のマークに移れるようにする。
  await interaction.update(
    renderAnswerPanel(summary.event, next, weekIndex, []),
  );
}

/** 「完了」。下書きを一括保存し、公開メッセージを更新してパネルを畳む。 */
export async function handleAnswerDone(
  interaction: ButtonInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const eventId = eventIdFromSuffix(interaction.customId, ANSWER_DONE_PREFIX);
  const summary = await deps.getScheduleSummary({ eventId });
  if (!summary) {
    await interaction.update({
      content: "見つかりませんでした。",
      components: [],
    });
    return;
  }
  const { draft } = parseAnswerPanel(interaction.message, summary.event);
  let saved: ScheduleSummary;
  try {
    const result = await deps.addResponses({
      eventId,
      userId: interaction.user.id,
      entries: commitEntries(summary.event, draft),
    });
    saved = result.summary;
  } catch (error) {
    // まだ update していないのでパネルは残る。reply でエラーだけ知らせる。
    await interaction.reply({ content: errorMessage(error), ...EPHEMERAL });
    return;
  }
  await interaction.update({
    content: "回答を保存しました。ご協力ありがとうございます！",
    embeds: [],
    components: [],
  });
  await updatePublicMessage(interaction.client, saved);
}

/** 「閉じる」。パネルを畳む(下書きは破棄・保存しない)。 */
export async function handleAnswerClose(
  interaction: ButtonInteraction,
): Promise<void> {
  await interaction.update({
    content: "回答パネルを閉じました。",
    embeds: [],
    components: [],
  });
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
  await interaction.reply({ ...renderScheduleList(items), ...EPHEMERAL });
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

/** 一覧の選択メニューで選んだ日程を、/schedule show と同じく公開メッセージで再表示する。 */
export async function handleListSelect(
  interaction: StringSelectMenuInteraction,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  const eventId = interaction.values[0];
  if (!interaction.inGuild() || interaction.channelId === null || !eventId) {
    await interaction.reply({
      content: "サーバー内のテキストチャンネルで使ってください。",
      ...EPHEMERAL,
    });
    return;
  }
  await interaction.deferReply(EPHEMERAL);

  const summary = await deps.getScheduleSummary({ eventId });
  if (!summary) {
    await interaction.editReply({
      content: "この日程調整は見つかりませんでした。",
    });
    return;
  }
  const channel = await fetchChannel(interaction.client, interaction.channelId);
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
  await interaction.editReply({
    content: `#${summary.event.guildSeq} を表示しました。`,
  });
}

// ── 削除 ─────────────────────────────────────────────

/** 作成者本人、または ManageEvents 権限を持つメンバーだけが削除できる。 */
function canDelete(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  creatorId: string,
): boolean {
  if (interaction.user.id === creatorId) {
    return true;
  }
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageEvents) ??
    false
  );
}

/**
 * /schedule delete 番号。番号→イベント解決→権限判定→確認パネル(ephemeral)を出す。
 * 実際の削除は「削除する」ボタン(handleDeleteConfirm)まで行わない。
 */
export async function handleDelete(
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
  const guildSeq = interaction.options.getInteger(DELETE_OPTION_NUMBER, true);
  const event = await deps.getScheduleEventByNumber({
    guildId: interaction.guildId,
    guildSeq,
  });
  if (!event) {
    await interaction.reply({
      content: `#${guildSeq} は見つかりませんでした。`,
      ...EPHEMERAL,
    });
    return;
  }
  if (!canDelete(interaction, event.creatorId)) {
    await interaction.reply({
      content:
        "この日程調整を削除できるのは、作成者本人または「イベントの管理」権限を持つ人だけです。",
      ...EPHEMERAL,
    });
    return;
  }

  const row =
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(encodeDeleteConfirm(event.id))
        .setLabel("削除する")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(DELETE_CANCEL)
        .setLabel("やめる")
        .setStyle(ButtonStyle.Secondary),
    );
  await interaction.reply({
    content: `#${event.guildSeq}「${event.title}」を削除します。候補・回答もすべて消えて元に戻せません。よろしいですか?`,
    components: [row],
    allowedMentions: { parse: [] },
    ...EPHEMERAL,
  });
}

/** 確認パネルの「削除する」。権限を再判定して物理削除し、公開メッセージも消す。 */
export async function handleDeleteConfirm(
  interaction: ButtonInteraction,
  eventId: string,
  deps: ScheduleInteractionDeps,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.update({
      content: "サーバー内で使ってください。",
      components: [],
    });
    return;
  }
  // 確認表示から確定までの間に前提が変わりうるため、確定時にも読み直して権限を再判定する。
  const summary = await deps.getScheduleSummary({ eventId });
  if (!summary) {
    await interaction.update({
      content: "この日程調整は既に削除されています。",
      embeds: [],
      components: [],
    });
    return;
  }
  if (!canDelete(interaction, summary.event.creatorId)) {
    await interaction.update({
      content:
        "この日程調整を削除できるのは、作成者本人または「イベントの管理」権限を持つ人だけです。",
      embeds: [],
      components: [],
    });
    return;
  }

  const deleted = await deps.deleteScheduleEvent({ eventId });
  if (!deleted) {
    await interaction.update({
      content: "この日程調整は既に削除されています。",
      embeds: [],
      components: [],
    });
    return;
  }
  await deletePublicMessage(
    interaction.client,
    deleted.channelId,
    deleted.messageId,
  );
  await interaction.update({
    content: `#${deleted.guildSeq}「${deleted.title}」を削除しました。`,
    embeds: [],
    components: [],
  });
}

/** 確認パネルの「やめる」。何もせずパネルを畳む。 */
export async function handleDeleteCancel(
  interaction: ButtonInteraction,
): Promise<void> {
  await interaction.update({
    content: "削除をキャンセルしました。",
    embeds: [],
    components: [],
  });
}
