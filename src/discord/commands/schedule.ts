import { ChannelType, SlashCommandBuilder } from "discord.js";

export const SHOW_OPTION_NUMBER = "number";
export const DELETE_OPTION_NUMBER = "number";
export const REMIND_OPTION_NUMBER = "number";
export const REMIND_OPTION_CHANNEL = "channel";
export const REMIND_OPTION_TIME = "time";

// 作成のみ権限で絞りたいが setDefaultMemberPermissions はルートコマンド全体
// (list/show を含む)に効いてしまうため、ここでは付けず handleCreateCommand で
// ManageEvents を確認する。list/show は誰でも使える。
export const scheduleCommand = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("固定活動の日程調整")
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub.setName("create").setDescription("日程調整を新規作成する"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("このサーバーの日程調整を番号付きで一覧する"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("show")
      .setDescription("番号で指定した日程調整を再表示する")
      .addIntegerOption((opt) =>
        opt
          .setName(SHOW_OPTION_NUMBER)
          .setDescription("番号(/schedule list に出る番号)")
          .setMinValue(1)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("番号で指定した日程調整を削除する")
      .addIntegerOption((opt) =>
        opt
          .setName(DELETE_OPTION_NUMBER)
          .setDescription("番号(/schedule list に出る番号)")
          .setMinValue(1)
          .setRequired(true),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("remind")
      .setDescription("予定ごとの当日リマインド設定")
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("指定した予定の当日リマインドを有効化する")
          .addIntegerOption((opt) =>
            opt
              .setName(REMIND_OPTION_NUMBER)
              .setDescription("番号(/schedule list に出る番号)")
              .setMinValue(1)
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName(REMIND_OPTION_TIME)
              .setDescription("送信時刻(JST、例 12:00)")
              .setRequired(true),
          )
          .addChannelOption((opt) =>
            opt
              .setName(REMIND_OPTION_CHANNEL)
              .setDescription("送信先チャンネル(既定: 予定を作ったチャンネル)")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("off")
          .setDescription("指定した予定の当日リマインドを停止する")
          .addIntegerOption((opt) =>
            opt
              .setName(REMIND_OPTION_NUMBER)
              .setDescription("番号(/schedule list に出る番号)")
              .setMinValue(1)
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("status")
          .setDescription("指定した予定の当日リマインド設定を確認する")
          .addIntegerOption((opt) =>
            opt
              .setName(REMIND_OPTION_NUMBER)
              .setDescription("番号(/schedule list に出る番号)")
              .setMinValue(1)
              .setRequired(true),
          ),
      ),
  );
