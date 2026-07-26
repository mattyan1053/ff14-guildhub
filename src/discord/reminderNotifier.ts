import type { Client } from "discord.js";
import type { ReminderNotifier } from "../application/schedule/ports/reminder.js";
import {
  reminderMentionUserIds,
  renderReminderMessage,
} from "./render/reminderMessage.js";

/**
 * ReminderNotifier の discord.js 実装。guild 設定のリマインドチャンネルへ投稿し、
 * メンションは回答履歴のあるユーザー(=参加者)だけに通知が飛ぶよう allowedMentions で絞る。
 */
export function createReminderNotifier(client: Client): ReminderNotifier {
  return {
    async sendDailyReminder(channelId, reminder, dateValue) {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isSendable()) {
        throw new Error(`reminder: channel is not sendable: ${channelId}`);
      }
      await channel.send({
        content: renderReminderMessage(reminder, dateValue),
        // 本文に並べたメンションと同じ集合に絞る(上限超過での送信拒否を防ぐ)。
        allowedMentions: { users: reminderMentionUserIds(reminder) },
      });
    },
  };
}
