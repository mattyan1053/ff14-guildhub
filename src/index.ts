import { randomUUID } from "node:crypto";
import { Cron } from "croner";
import { Events } from "discord.js";
import { makeAddResponses } from "./application/schedule/addResponses.js";
import { makeAttachScheduleMessage } from "./application/schedule/attachScheduleMessage.js";
import { makeCreateScheduleEvent } from "./application/schedule/createScheduleEvent.js";
import { makeDeleteScheduleEvent } from "./application/schedule/deleteScheduleEvent.js";
import { makeDisableEventReminder } from "./application/schedule/disableEventReminder.js";
import { makeGetEventReminder } from "./application/schedule/getEventReminder.js";
import { makeGetScheduleEventByNumber } from "./application/schedule/getScheduleEventByNumber.js";
import { makeGetScheduleSummary } from "./application/schedule/getScheduleSummary.js";
import { makeListScheduleEvents } from "./application/schedule/listScheduleEvents.js";
import { makeRunDueReminders } from "./application/schedule/runDueReminders.js";
import { makeSetEventReminder } from "./application/schedule/setEventReminder.js";
import { makeShowScheduleEvent } from "./application/schedule/showScheduleEvent.js";
import { EnvValidationError, loadEnv } from "./config/env.js";
import { createDiscordClient } from "./discord/client.js";
import { makeInteractionHandler } from "./discord/interactions/router.js";
import { registerCommands } from "./discord/register.js";
import { createReminderNotifier } from "./discord/reminderNotifier.js";
import { createDatabase } from "./infrastructure/database/connection.js";
import { migrateToLatest } from "./infrastructure/database/migrator.js";
import { createKyselyReminderRepository } from "./infrastructure/persistence/schedule/kyselyReminderRepository.js";
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
  const reminderRepository = createKyselyReminderRepository(db);
  const newId = (): string => randomUUID();
  const now = (): Date => new Date();
  const interactionHandler = makeInteractionHandler({
    createScheduleEvent: makeCreateScheduleEvent({ repository, newId, now }),
    addResponses: makeAddResponses({ repository, newId, now }),
    getScheduleSummary: makeGetScheduleSummary({ repository }),
    attachScheduleMessage: makeAttachScheduleMessage({ repository }),
    listScheduleEvents: makeListScheduleEvents({ repository }),
    showScheduleEvent: makeShowScheduleEvent({ repository }),
    getScheduleEventByNumber: makeGetScheduleEventByNumber({ repository }),
    deleteScheduleEvent: makeDeleteScheduleEvent({ repository }),
    setEventReminder: makeSetEventReminder({
      reminderRepository: reminderRepository.reminders,
    }),
    disableEventReminder: makeDisableEventReminder({
      reminderRepository: reminderRepository.reminders,
    }),
    getEventReminder: makeGetEventReminder({
      reminderRepository: reminderRepository.reminders,
    }),
  });

  const client = createDiscordClient();

  const runDueReminders = makeRunDueReminders({
    scheduleRepository: repository,
    reminderRepository: reminderRepository.reminders,
    deliveryRepository: reminderRepository.deliveries,
    notifier: createReminderNotifier(client),
    now,
    onSendError: (error) => console.error("reminder: failed to send", error),
  });
  // 毎分tickで「設定時刻を過ぎて当日未判定」の分を判定・送信する(ADR 0011)。
  // croner は fn の戻り値を await して protect(重複実行の保護)を判定するため、
  // Promise を返さないと保護が効かない。tick 自身がエラーを飲み込む。
  const reminderTick = async (): Promise<void> => {
    try {
      await runDueReminders();
    } catch (error) {
      console.error("reminder: tick failed", error);
    }
  };
  let reminderJob: Cron | null = null;

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
    reminderJob = new Cron("* * * * *", { protect: true }, reminderTick);
    console.log("reminder: scheduler started (every minute)");
    // 起動直後に1回走らせる。JST日の最終分に復帰すると次のtick(00:00)では日付が
    // 変わっており、当日中の追い送り(ADR 0011)が失われるため。
    // trigger() 経由なら初回も protect の管理下に入り、直後のtickと重ならない。
    await reminderJob.trigger();
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
    reminderJob?.stop();
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
