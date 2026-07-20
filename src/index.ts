import { Events } from "discord.js";
import { EnvValidationError, loadEnv } from "./config/env.js";
import { createDiscordClient } from "./discord/client.js";
import { createDatabase } from "./infrastructure/database/connection.js";
import { migrateToLatest } from "./infrastructure/database/migrator.js";

async function main(): Promise<void> {
  let env: ReturnType<typeof loadEnv>;
  try {
    env = loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const db = createDatabase(env.database.filePath);
  const appliedCount = await migrateToLatest(db);
  console.log(`database: ready (${appliedCount} migration(s) applied)`);

  const client = createDiscordClient();

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`discord: ready (logged in as ${readyClient.user.tag})`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`received ${signal}, shutting down`);
    await client.destroy();
    await db.destroy();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await client.login(env.discordToken);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
