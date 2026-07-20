import { sql } from "kysely";
import type {
  ScheduleEventListItem,
  ScheduleRepository,
  UpsertResponseInput,
} from "../../../application/schedule/ports/scheduleRepository.js";
import type {
  EventStatus,
  Response,
  ScheduleEvent,
} from "../../../domain/schedule/scheduleEvent.js";
import type { AppDatabase, DatabaseSchema } from "../../database/connection.js";
import {
  toCandidateRows,
  toDomainEvent,
  toDomainResponse,
  toEventRow,
  toResponseOptionRows,
} from "./mappers.js";

async function loadEvent(
  db: AppDatabase,
  row: DatabaseSchema["events"],
): Promise<ScheduleEvent> {
  const candidates = await db
    .selectFrom("candidates")
    .selectAll()
    .where("event_id", "=", row.id)
    .orderBy("position", "asc")
    .execute();
  const options = await db
    .selectFrom("response_options")
    .selectAll()
    .where("event_id", "=", row.id)
    .orderBy("position", "asc")
    .execute();
  return toDomainEvent(row, candidates, options);
}

/**
 * Kysely による ScheduleRepository の実装。
 * テーブル構造はこのモジュールの外へ漏らさない(ドメイン型で受け渡す)。
 */
export function createKyselyScheduleRepository(
  db: AppDatabase,
): ScheduleRepository {
  return {
    async nextGuildSeq(guildId: string): Promise<number> {
      const row = await db
        .selectFrom("events")
        .select((eb) => eb.fn.max("guild_seq").as("max"))
        .where("guild_id", "=", guildId)
        .executeTakeFirst();
      return (row?.max ?? 0) + 1;
    },

    async create(event: ScheduleEvent): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.insertInto("events").values(toEventRow(event)).execute();

        const candidateRows = toCandidateRows(event);
        if (candidateRows.length > 0) {
          await trx.insertInto("candidates").values(candidateRows).execute();
        }

        const optionRows = toResponseOptionRows(event);
        if (optionRows.length > 0) {
          await trx.insertInto("response_options").values(optionRows).execute();
        }
      });
    },

    async findById(eventId: string): Promise<ScheduleEvent | null> {
      const row = await db
        .selectFrom("events")
        .selectAll()
        .where("id", "=", eventId)
        .executeTakeFirst();
      return row ? await loadEvent(db, row) : null;
    },

    async findByGuildSeq(
      guildId: string,
      guildSeq: number,
    ): Promise<ScheduleEvent | null> {
      const row = await db
        .selectFrom("events")
        .selectAll()
        .where("guild_id", "=", guildId)
        .where("guild_seq", "=", guildSeq)
        .executeTakeFirst();
      return row ? await loadEvent(db, row) : null;
    },

    async listByGuild(guildId: string): Promise<ScheduleEventListItem[]> {
      const rows = await db
        .selectFrom("events")
        .select(["id", "guild_seq", "title", "status"])
        .where("guild_id", "=", guildId)
        .orderBy("guild_seq", "desc")
        .execute();
      return rows.map((row) => ({
        id: row.id,
        guildSeq: row.guild_seq,
        title: row.title,
        status: row.status as EventStatus,
      }));
    },

    async setMessageId(eventId: string, messageId: string): Promise<void> {
      await db
        .updateTable("events")
        .set({ message_id: messageId })
        .where("id", "=", eventId)
        .execute();
    },

    async upsertResponse(input: UpsertResponseInput): Promise<void> {
      const iso = input.now.toISOString();
      await db
        .insertInto("responses")
        .values({
          id: input.id,
          event_id: input.eventId,
          candidate_id: input.candidateId,
          response_option_id: input.responseOptionId,
          user_id: input.userId,
          created_at: iso,
          updated_at: iso,
        })
        .onConflict((oc) =>
          oc.columns(["candidate_id", "user_id"]).doUpdateSet({
            response_option_id: input.responseOptionId,
            updated_at: iso,
          }),
        )
        .execute();
    },

    async listResponses(eventId: string): Promise<Response[]> {
      const rows = await db
        .selectFrom("responses")
        .selectAll()
        .where("event_id", "=", eventId)
        .orderBy(sql`rowid`, "asc")
        .execute();
      return rows.map(toDomainResponse);
    },
  };
}
