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
import {
  down as downGuildCounters,
  up as upGuildCounters,
} from "../../database/migrations/0002_guild_counters.js";
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

/** 0001 と 0002 の両方を適用した実 DB 相当のセットアップ。 */
async function setup(): Promise<AppDatabase> {
  const db = createDatabase(":memory:");
  await migrateToLatest(
    db,
    testProvider({
      "0001_create_schedule_tables": { up, down },
      "0002_guild_counters": { up: upGuildCounters, down: downGuildCounters },
    }),
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

  describe("allocateGuildSeq", () => {
    it("空の guild では最初の払い出しが 1", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);

      expect(await repo.allocateGuildSeq("guild-1")).toBe(1);
    });

    it("連続して払い出すと 1, 2, 3 と単調増加し同値を返さない", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);

      expect(await repo.allocateGuildSeq("guild-1")).toBe(1);
      expect(await repo.allocateGuildSeq("guild-1")).toBe(2);
      expect(await repo.allocateGuildSeq("guild-1")).toBe(3);
    });

    it("別 guild の連番は独立している", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      await repo.allocateGuildSeq("guild-1");
      await repo.allocateGuildSeq("guild-1");

      expect(await repo.allocateGuildSeq("guild-2")).toBe(1);
    });

    it("末尾を delete しても番号を再利用しない", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      // 本番の採番フロー(allocate → create)を踏襲して #1..#3 を作る。
      // 子行は共有ヘルパの固定 id 衝突を避けるため空にする。
      for (const id of ["e1", "e2", "e3"]) {
        const seq = await repo.allocateGuildSeq("guild-1");
        await repo.create(
          buildEvent({
            id,
            guildId: "guild-1",
            guildSeq: seq,
            candidates: [],
            responseOptions: [],
          }),
        );
      }

      // 末尾 #3 を削除しても、カウンタは減らない。
      await repo.delete("e3");

      // 3 は再利用されず、次の払い出しは 4。3 は二度と出ない。
      expect(await repo.allocateGuildSeq("guild-1")).toBe(4);
    });
  });

  describe("0002 guild_counters バックフィル", () => {
    /** 0001 のみ適用した DB を作り、既存 events を用意する。 */
    async function setupWithoutCounters(): Promise<AppDatabase> {
      const fresh = createDatabase(":memory:");
      await migrateToLatest(
        fresh,
        testProvider({ "0001_create_schedule_tables": { up, down } }),
      );
      return fresh;
    }

    /** 0002 を追加適用してバックフィルを走らせる。 */
    async function applyGuildCounters(target: AppDatabase): Promise<void> {
      await migrateToLatest(
        target,
        testProvider({
          "0001_create_schedule_tables": { up, down },
          "0002_guild_counters": {
            up: upGuildCounters,
            down: downGuildCounters,
          },
        }),
      );
    }

    it("既存 events の max(guild_seq) を guild ごとに guild_counters へシードする", async () => {
      db = await setupWithoutCounters();
      const repo = createKyselyScheduleRepository(db);
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
      await repo.create(
        buildEvent({
          id: "e3",
          guildId: "guild-2",
          guildSeq: 5,
          candidates: [],
          responseOptions: [],
        }),
      );

      await applyGuildCounters(db);

      const counters = await db
        .selectFrom("guild_counters")
        .selectAll()
        .orderBy("guild_id", "asc")
        .execute();
      expect(counters).toEqual([
        { guild_id: "guild-1", last_seq: 2 },
        { guild_id: "guild-2", last_seq: 5 },
      ]);
    });

    it("バックフィル後の最初の allocate は max(guild_seq)+1 になる", async () => {
      db = await setupWithoutCounters();
      const repo = createKyselyScheduleRepository(db);
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

      await applyGuildCounters(db);

      expect(await repo.allocateGuildSeq("guild-1")).toBe(3);
    });

    it("events を持たない guild は初回 allocate が 1 から始まる", async () => {
      db = await setupWithoutCounters();
      const repo = createKyselyScheduleRepository(db);
      await applyGuildCounters(db);

      expect(await repo.allocateGuildSeq("guild-empty")).toBe(1);
    });
  });

  describe("attachMessage", () => {
    it("channel_id と message_id を更新し findById に反映する", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();
      await repo.create(event);

      await repo.attachMessage(event.id, "channel-99", "message-99");

      const stored = await repo.findById(event.id);
      expect(stored?.messageId).toBe("message-99");
      expect(stored?.channelId).toBe("channel-99");
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

    it("upsertResponses は複数候補を一括保存し、再実行で置換する", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();
      await repo.create(event);

      await repo.upsertResponses([
        {
          id: "resp-1",
          eventId: event.id,
          candidateId: "cand-0",
          responseOptionId: "opt-yes",
          userId: "user-1",
          now: FIXED_NOW,
        },
        {
          id: "resp-2",
          eventId: event.id,
          candidateId: "cand-1",
          responseOptionId: "opt-no",
          userId: "user-1",
          now: FIXED_NOW,
        },
      ]);
      let responses = await repo.listResponses(event.id);
      expect(responses).toHaveLength(2);

      // 同じ (candidate, user) を含む一括再実行は行を増やさず置換する
      await repo.upsertResponses([
        {
          id: "resp-3",
          eventId: event.id,
          candidateId: "cand-0",
          responseOptionId: "opt-no",
          userId: "user-1",
          now: new Date("2026-07-20T10:00:00.000Z"),
        },
      ]);
      responses = await repo.listResponses(event.id);
      expect(responses).toHaveLength(2);
      expect(
        responses.find((r) => r.candidateId === "cand-0")?.responseOptionId,
      ).toBe("opt-no");
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

  describe("delete", () => {
    it("delete で event を消し、findById が null になる", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      const event = buildEvent();
      await repo.create(event);

      await repo.delete(event.id);

      expect(await repo.findById(event.id)).toBeNull();
    });

    it("delete で candidates / response_options / responses も cascade で消える", async () => {
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

      await repo.delete(event.id);

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

    it("他の event は巻き込まず、対象だけを消す", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      await repo.create(
        buildEvent({
          id: "e1",
          guildSeq: 1,
          candidates: [],
          responseOptions: [],
        }),
      );
      await repo.create(
        buildEvent({
          id: "e2",
          guildSeq: 2,
          candidates: [],
          responseOptions: [],
        }),
      );

      await repo.delete("e1");

      expect(await repo.findById("e1")).toBeNull();
      expect(await repo.findById("e2")).not.toBeNull();
    });

    it("存在しない id の delete は no-op(例外を投げない)", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);

      await expect(repo.delete("missing")).resolves.toBeUndefined();
    });
  });

  describe("findByGuildSeq と listByGuild", () => {
    it("guild 内連番でイベントを引く", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      await repo.create(
        buildEvent({
          id: "e1",
          guildSeq: 1,
          candidates: [],
          responseOptions: [],
        }),
      );
      await repo.create(
        buildEvent({
          id: "e2",
          guildSeq: 2,
          candidates: [],
          responseOptions: [],
        }),
      );

      const found = await repo.findByGuildSeq("guild-1", 2);
      expect(found?.id).toBe("e2");
    });

    it("該当連番が無ければ null", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);

      expect(await repo.findByGuildSeq("guild-1", 5)).toBeNull();
    });

    it("guild のイベントを連番降順で一覧する", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
      await repo.create(
        buildEvent({
          id: "e1",
          guildSeq: 1,
          title: "1回目",
          candidates: [],
          responseOptions: [],
        }),
      );
      await repo.create(
        buildEvent({
          id: "e2",
          guildSeq: 2,
          title: "2回目",
          candidates: [],
          responseOptions: [],
        }),
      );

      const items = await repo.listByGuild("guild-1");
      expect(items.map((i) => i.guildSeq)).toEqual([2, 1]);
      expect(items[0]?.title).toBe("2回目");
      expect(items[0]?.status).toBe("open");
    });

    it("別 guild のイベントは一覧に含めない", async () => {
      db = await setup();
      const repo = createKyselyScheduleRepository(db);
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
          guildId: "guild-2",
          guildSeq: 1,
          candidates: [],
          responseOptions: [],
        }),
      );

      expect(await repo.listByGuild("guild-2")).toHaveLength(1);
    });
  });
});
