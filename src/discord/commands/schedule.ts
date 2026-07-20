import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export const SHOW_OPTION_NUMBER = "number";

export const scheduleCommand = new SlashCommandBuilder()
  .setName("schedule")
  .setDescription("固定活動の日程調整")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
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
  );
