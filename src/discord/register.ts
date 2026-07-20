import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

export interface RegisterCommandsInput {
  token: string;
  applicationId: string;
  /** 指定するとそのギルドにのみ即時反映(開発用)。null/未指定はグローバル登録。 */
  devGuildId?: string | null;
}

/**
 * アプリケーションコマンドを Discord に登録する。登録した件数を返す。
 */
export async function registerCommands(
  input: RegisterCommandsInput,
): Promise<number> {
  const rest = new REST().setToken(input.token);
  const body = commands.map((command) => command.toJSON());
  const route = input.devGuildId
    ? Routes.applicationGuildCommands(input.applicationId, input.devGuildId)
    : Routes.applicationCommands(input.applicationId);

  await rest.put(route, { body });
  return body.length;
}
