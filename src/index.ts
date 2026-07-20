import { randomUUID } from "node:crypto";
import { Events } from "discord.js";
import { makeAddResponse } from "./application/schedule/addResponse.js";
import { makeAttachScheduleMessage } from "./application/schedule/attachScheduleMessage.js";
import { makeCreateScheduleEvent } from "./application/schedule/createScheduleEvent.js";
import { makeGetScheduleSummary } from "./application/schedule/getScheduleSummary.js";
import { makeListScheduleEvents } from "./application/schedule/listScheduleEvents.js";
import { makeShowScheduleEvent } from "./application/schedule/showScheduleEvent.js";
import { EnvValidationError, loadEnv } from "./config/env.js";
import { createDiscordClient } from "./discord/client.js";
import { makeInteractionHandler } from "./discord/interactions/router.js";
import { registerCommands } from "./discord/register.js";
import { createDatabase } from "./infrastructure/database/connection.js";
import { migrateToLatest } from "./infrastructure/database/migrator.js";
import { createKyselyScheduleRepository } from "./infrastructure/persistence/schedule/kyselyScheduleRepository.js";

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

  const repository = createKyselyScheduleRepository(db);
  const newId = (): string => randomUUID();
  const now = (): Date => new Date();
  const interactionHandler = makeInteractionHandler({
    createScheduleEvent: makeCreateScheduleEvent({ repository, newId, now }),
    addResponse: makeAddResponse({ repository, newId, now }),
    getScheduleSummary: makeGetScheduleSummary({ repository }),
    attachScheduleMessage: makeAttachScheduleMessage({ repository }),
    listScheduleEvents: makeListScheduleEvents({ repository }),
    showScheduleEvent: makeShowScheduleEvent({ repository }),
  });

  const client = createDiscordClient();

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`discord: ready (logged in as ${readyClient.user.tag})`);
    try {
      const count = await registerCommands({
        token: env.discordToken,
        applicationId: readyClient.application.id,
        devGuildId: env.discordDevGuildId,
      });
      console.log(`discord: registered ${count} command(s)`);
    } catch (error) {
      console.error("discord: failed to register commands", error);
    }
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void interactionHandler(interaction);
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
