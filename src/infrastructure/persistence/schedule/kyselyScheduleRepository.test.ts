import type { Migration, MigrationProvider } from "kysely/migration";
import { afterEach, describe, expect, it } from "vitest";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../../domain/schedule/scheduleEvent.js";
import { type AppDatabase, createDatabase } from "../../database/connection.js";
import {
  down,
  up,
} from "../../database/migrations/0001_create_schedule_tables.js";
import { migrateToLatest } from "../../database/migrator.js";
import { createKyselyScheduleRepository } from "./kyselyScheduleRepository.js";

function testProvider(
  migrations: Record<string, Migration>,
): MigrationProvider {
  return {
    getMigrations: () => Promise.resolve(migrations),
  };
}

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");
const CANDIDATE_STARTS_AT = new Date("2026-07-25T12:00:00.000Z");

/**
 * 候補2件・状態集合(いつでも/時刻/未定/不可)を持つ ScheduleEvent を組む。
 */
function buildEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  const id = overrides.id ?? "event-1";
  const candidates: Candidate[] = [
    {
      id: "cand-0",
      label: "7/25(金)",
      startsAt: CANDIDATE_STARTS_AT,
      position: 0,
    },
    { id: "cand-1", label: "未定", startsAt: null, position: 1 },
  ];
  const responseOptions: ResponseOption[] = [
    {
      id: "opt-yes",
      label: "いつでも",
      kind: "yes",
      startMinute: null,
      position: 0,
    },
    {
      id: "opt-time",
      label: "21:30〜",
      kind: "time",
      startMinute: 21 * 60 + 30,
      position: 1,
    },
    {
      id: "opt-maybe",
      label: "未定",
      kind: "maybe",
      startMinute: null,
      position: 2,
    },
    { id: "opt-no", label: "不可", kind: "no", startMinute: null, position: 3 },
  ];
  return {
    id,
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: null,
    creatorId: "creator-1",
    guildSeq: 1,
    title: "固定活動の日程調整",
    description: "今週の予定",
    status: "open",
    candidates,
    responseOptions,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

async function setup(): Promise<AppDatabase> {
  const db = createDatabase(":memory:");
  await migrateToLatest(
    db,
    testProvider({ "0001_create_schedule_tables": { up, down } }),
  );
  return db;
}

describe("createKyselyScheduleRepository", () => {
  let db: AppDatabase | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  describe("create と findById", () => {
    it("event の各フィールドを復元する", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();

      await repo.create(event);
      const found = await repo.findById(event.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(event.id);
      expect(found?.guildId).toBe("guild-1");
      expect(found?.channelId).toBe("channel-1");
      expect(found?.creatorId).toBe("creator-1");
      expect(found?.guildSeq).toBe(1);
      expect(found?.title).toBe("固定活動の日程調整");
      expect(found?.description).toBe("今週の予定");
      expect(found?.status).toBe("open");
      expect(found?.messageId).toBeNull();
      expect(found?.createdAt).toEqual(FIXED_NOW);
      expect(found?.updatedAt).toEqual(FIXED_NOW);
    });

    it("candidates を position 昇順で復元し startsAt(Date|null)を保つ", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();

      await repo.create(event);
      const found = await repo.findById(event.id);

      expect(found?.candidates.map((c) => c.position)).toEqual([0, 1]);
      expect(found?.candidates[0]?.label).toBe("7/25(金)");
      expect(found?.candidates[0]?.startsAt).toEqual(CANDIDATE_STARTS_AT);
      expect(found?.candidates[1]?.startsAt).toBeNull();
    });

    it("response_options を position 昇順で kind と startMinute とともに復元する", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();

      await repo.create(event);
      const found = await repo.findById(event.id);

      expect(found?.responseOptions.map((o) => o.kind)).toEqual([
        "yes",
        "time",
        "maybe",
        "no",
      ]);
      expect(found?.responseOptions[1]?.startMinute).toBe(21 * 60 + 30);
      expect(found?.responseOptions[0]?.startMinute).toBeNull();
    });

    it("存在しない id では null を返す", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);

      expect(await repo.findById("missing")).toBeNull();
    });
  });

  describe("nextGuildSeq", () => {
    it("空の guild では 1 を返す", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);

      expect(await repo.nextGuildSeq("guild-1")).toBe(1);
    });

    it("既存イベントがある guild では max+1 を返す", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      // 実運用では子行の id は UUID で衝突しない。ここでは guild_seq の採番のみを
      // 検証するため、子行を空にして共有ヘルパの固定 id 衝突を避ける。
      await repo.create(
        buildEvent({
          id: "e1",
          guildId: "guild-1",
          guildSeq: 1,
          candidates: [],
          responseOptions: [],
        }),
      );
      await repo.create(
        buildEvent({
          id: "e2",
          guildId: "guild-1",
          guildSeq: 2,
          candidates: [],
          responseOptions: [],
        }),
      );

      expect(await repo.nextGuildSeq("guild-1")).toBe(3);
    });

    it("別 guild の連番は独立している", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      await repo.create(
        buildEvent({ id: "e1", guildId: "guild-1", guildSeq: 5 }),
      );

      expect(await repo.nextGuildSeq("guild-2")).toBe(1);
    });
  });

  describe("setMessageId", () => {
    it("message_id を更新し findById に反映する", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();
      await repo.create(event);

      await repo.setMessageId(event.id, "message-99");

      expect((await repo.findById(event.id))?.messageId).toBe("message-99");
    });
  });

  describe("upsertResponse と listResponses", () => {
    it("初回は insert される", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();
      await repo.create(event);

      await repo.upsertResponse({
        id: "resp-1",
        eventId: event.id,
        candidateId: "cand-0",
        responseOptionId: "opt-yes",
        userId: "user-1",
        now: FIXED_NOW,
      });

      const responses = await repo.listResponses(event.id);
      expect(responses).toHaveLength(1);
      expect(responses[0]?.candidateId).toBe("cand-0");
      expect(responses[0]?.responseOptionId).toBe("opt-yes");
      expect(responses[0]?.userId).toBe("user-1");
    });

    it("同一 (candidate, user) の再 upsert は1行のまま置換する", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();
      await repo.create(event);

      await repo.upsertResponse({
        id: "resp-1",
        eventId: event.id,
        candidateId: "cand-0",
        responseOptionId: "opt-yes",
        userId: "user-1",
        now: FIXED_NOW,
      });
      await repo.upsertResponse({
        id: "resp-2",
        eventId: event.id,
        candidateId: "cand-0",
        responseOptionId: "opt-no",
        userId: "user-1",
        now: new Date("2026-07-20T10:00:00.000Z"),
      });

      const responses = await repo.listResponses(event.id);
      expect(responses).toHaveLength(1);
      expect(responses[0]?.responseOptionId).toBe("opt-no");
    });

    it("listResponses は挿入順で返す(更新後も順序を保つ)", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();
      await repo.create(event);

      await repo.upsertResponse({
        id: "resp-1",
        eventId: event.id,
        candidateId: "cand-0",
        responseOptionId: "opt-yes",
        userId: "user-2",
        now: FIXED_NOW,
      });
      await repo.upsertResponse({
        id: "resp-2",
        eventId: event.id,
        candidateId: "cand-0",
        responseOptionId: "opt-yes",
        userId: "user-1",
        now: FIXED_NOW,
      });
      // 先に入れた回答を更新しても順序は変わらない
      await repo.upsertResponse({
        id: "resp-3",
        eventId: event.id,
        candidateId: "cand-0",
        responseOptionId: "opt-no",
        userId: "user-2",
        now: new Date("2026-07-20T11:00:00.000Z"),
      });

      const responses = await repo.listResponses(event.id);
      expect(responses.map((r) => r.userId)).toEqual(["user-2", "user-1"]);
    });
  });

  describe("cascade 削除", () => {
    it("event を削除すると candidates / response_options / responses が消える", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();
      await repo.create(event);
      await repo.upsertResponse({
        id: "resp-1",
        eventId: event.id,
        candidateId: "cand-0",
        responseOptionId: "opt-yes",
        userId: "user-1",
        now: FIXED_NOW,
      });

      await db.deleteFrom("events").where("id", "=", event.id).execute();

      const candidates = await db
        .selectFrom("candidates")
        .selectAll()
        .where("event_id", "=", event.id)
        .execute();
      const options = await db
        .selectFrom("response_options")
        .selectAll()
        .where("event_id", "=", event.id)
        .execute();
      const responses = await db
        .selectFrom("responses")
        .selectAll()
        .where("event_id", "=", event.id)
        .execute();

      expect(candidates).toHaveLength(0);
      expect(options).toHaveLength(0);
      expect(responses).toHaveLength(0);
    });
  });
});
