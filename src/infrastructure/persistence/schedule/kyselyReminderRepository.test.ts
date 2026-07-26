import type { Migration, MigrationProvider } from "kysely/migration";
import { afterEach, describe, expect, it } from "vitest";
import { startsAtFromDateValue } from "../../../domain/schedule/datePresets.js";
import type {
  Candidate,
  ResponseOption,
  ScheduleEvent,
} from "../../../domain/schedule/scheduleEvent.js";
import { type AppDatabase, createDatabase } from "../../database/connection.js";
import {
  down as down1,
  up as up1,
} from "../../database/migrations/0001_create_schedule_tables.js";
import {
  down as down2,
  up as up2,
} from "../../database/migrations/0002_guild_counters.js";
import {
  down as down3,
  up as up3,
} from "../../database/migrations/0003_reminders.js";
import { migrateToLatest } from "../../database/migrator.js";
import { createKyselyReminderRepository } from "./kyselyReminderRepository.js";
import { createKyselyScheduleRepository } from "./kyselyScheduleRepository.js";

function testProvider(
  migrations: Record<string, Migration>,
): MigrationProvider {
  return {
    getMigrations: () => Promise.resolve(migrations),
  };
}

const FIXED_NOW = new Date("2026-07-20T09:00:00.000Z");
const TODAY = "2026-07-27";

function startsAtOf(value: string): Date {
  const startsAt = startsAtFromDateValue(value);
  if (!startsAt) {
    throw new Error(`invalid date value: ${value}`);
  }
  return startsAt;
}

/**
 * 候補1件(既定は今日)+ 選択肢2件を持つ ScheduleEvent を組む。
 * 子行の id は event id を接頭辞にして event 間で衝突しないようにする。
 */
function buildEvent(opts: {
  id: string;
  guildId?: string;
  guildSeq?: number;
  dateValue?: string | null;
}): ScheduleEvent {
  const dateValue = opts.dateValue === undefined ? TODAY : opts.dateValue;
  const candidates: Candidate[] = [
    {
      id: `${opts.id}-c0`,
      label: dateValue ?? "未定",
      startsAt: dateValue ? startsAtOf(dateValue) : null,
      position: 0,
    },
  ];
  const responseOptions: ResponseOption[] = [
    {
      id: `${opts.id}-opt-yes`,
      label: "いつでも",
      kind: "yes",
      startMinute: null,
      position: 0,
    },
    {
      id: `${opts.id}-opt-time`,
      label: "21:30〜",
      kind: "time",
      startMinute: 21 * 60 + 30,
      position: 1,
    },
  ];
  return {
    id: opts.id,
    guildId: opts.guildId ?? "guild-1",
    channelId: "channel-1",
    messageId: null,
    creatorId: "creator-1",
    guildSeq: opts.guildSeq ?? 1,
    title: "固定活動の日程調整",
    description: null,
    status: "open",
    candidates,
    responseOptions,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

/** 0001〜0003 を適用した実 DB 相当のセットアップ。 */
async function setup(): Promise<AppDatabase> {
  const db = createDatabase(":memory:");
  await migrateToLatest(
    db,
    testProvider({
      "0001_create_schedule_tables": { up: up1, down: down1 },
      "0002_guild_counters": { up: up2, down: down2 },
      "0003_reminders": { up: up3, down: down3 },
    }),
  );
  return db;
}

describe("createKyselyReminderRepository", () => {
  let db: AppDatabase | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  describe("settings", () => {
    it("upsert した設定を find で復元する", async () => {
      db = await setup();
      const repo = createKyselyReminderRepository(db);

      await repo.settings.upsert({
        guildId: "guild-1",
        channelId: "channel-1",
        remindMinute: 1290,
      });

      expect(await repo.settings.find("guild-1")).toEqual({
        guildId: "guild-1",
        channelId: "channel-1",
        remindMinute: 1290,
      });
    });

    it("同一 guild への upsert は行を増やさず上書きする", async () => {
      db = await setup();
      const repo = createKyselyReminderRepository(db);
      await repo.settings.upsert({
        guildId: "guild-1",
        channelId: "channel-1",
        remindMinute: 1290,
      });

      await repo.settings.upsert({
        guildId: "guild-1",
        channelId: "channel-2",
        remindMinute: 600,
      });

      const all = await repo.settings.listAll();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual({
        guildId: "guild-1",
        channelId: "channel-2",
        remindMinute: 600,
      });
    });

    it("未設定の guild は find で null", async () => {
      db = await setup();
      const repo = createKyselyReminderRepository(db);

      expect(await repo.settings.find("missing")).toBeNull();
    });

    it("delete で設定が消え、find が null になる", async () => {
      db = await setup();
      const repo = createKyselyReminderRepository(db);
      await repo.settings.upsert({
        guildId: "guild-1",
        channelId: "channel-1",
        remindMinute: 1290,
      });

      await repo.settings.delete("guild-1");

      expect(await repo.settings.find("guild-1")).toBeNull();
    });

    it("存在しない guild の delete は no-op(例外を投げない)", async () => {
      db = await setup();
      const repo = createKyselyReminderRepository(db);

      await expect(repo.settings.delete("missing")).resolves.toBeUndefined();
    });

    it("listAll は全 guild の設定を返す", async () => {
      db = await setup();
      const repo = createKyselyReminderRepository(db);
      await repo.settings.upsert({
        guildId: "guild-1",
        channelId: "channel-1",
        remindMinute: 1290,
      });
      await repo.settings.upsert({
        guildId: "guild-2",
        channelId: "channel-2",
        remindMinute: 600,
      });

      const all = await repo.settings.listAll();

      expect(all).toHaveLength(2);
      expect(all.map((s) => s.guildId).sort()).toEqual(["guild-1", "guild-2"]);
    });
  });

  describe("deliveries", () => {
    it("未記録の (event, date) は wasJudged が false", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));

      expect(await repo.deliveries.wasJudged("e1", TODAY)).toBe(false);
    });

    it("markJudged 後は wasJudged が true になり、別の日付・別のイベントには影響しない", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));
      await scheduleRepo.create(buildEvent({ id: "e2", guildSeq: 2 }));

      await repo.deliveries.markJudged("e1", TODAY, FIXED_NOW);

      expect(await repo.deliveries.wasJudged("e1", TODAY)).toBe(true);
      expect(await repo.deliveries.wasJudged("e1", "2026-07-28")).toBe(false);
      expect(await repo.deliveries.wasJudged("e2", TODAY)).toBe(false);
    });

    it("event を削除すると判定記録も cascade で消える", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));
      await repo.deliveries.markJudged("e1", TODAY, FIXED_NOW);
      expect(await repo.deliveries.wasJudged("e1", TODAY)).toBe(true);

      await scheduleRepo.delete("e1");

      expect(await repo.deliveries.wasJudged("e1", TODAY)).toBe(false);
    });
  });
});

describe("kyselyScheduleRepository.listOpenEventsByCandidateDate", () => {
  let db: AppDatabase | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("該当 guild・該当日の候補を持つイベントだけ返す", async () => {
    db = await setup();
    const repo = createKyselyScheduleRepository(db);
    await repo.create(buildEvent({ id: "e1", guildId: "guild-1" }));
    await repo.create(
      buildEvent({
        id: "e2",
        guildId: "guild-1",
        guildSeq: 2,
        dateValue: "2026-07-28",
      }),
    );
    await repo.create(buildEvent({ id: "e3", guildId: "guild-2" }));

    const found = await repo.listOpenEventsByCandidateDate(
      "guild-1",
      startsAtOf(TODAY),
    );

    expect(found.map((e) => e.id)).toEqual(["e1"]);
  });

  it("同日に候補を持つ複数イベントをすべて返す", async () => {
    db = await setup();
    const repo = createKyselyScheduleRepository(db);
    await repo.create(buildEvent({ id: "e1", guildId: "guild-1" }));
    await repo.create(
      buildEvent({ id: "e2", guildId: "guild-1", guildSeq: 2 }),
    );

    const found = await repo.listOpenEventsByCandidateDate(
      "guild-1",
      startsAtOf(TODAY),
    );

    expect(found.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("startsAt が null の候補しか持たないイベントは返さない", async () => {
    db = await setup();
    const repo = createKyselyScheduleRepository(db);
    await repo.create(
      buildEvent({ id: "e1", guildId: "guild-1", dateValue: null }),
    );

    const found = await repo.listOpenEventsByCandidateDate(
      "guild-1",
      startsAtOf(TODAY),
    );

    expect(found).toHaveLength(0);
  });

  it("open でないイベントは返さない", async () => {
    db = await setup();
    const repo = createKyselyScheduleRepository(db);
    await repo.create(buildEvent({ id: "e1", guildId: "guild-1" }));
    // EventStatus は現状 "open" のみなので、行を直接書き換えて非 open を作る。
    await db
      .updateTable("events")
      .set({ status: "closed" })
      .where("id", "=", "e1")
      .execute();

    const found = await repo.listOpenEventsByCandidateDate(
      "guild-1",
      startsAtOf(TODAY),
    );

    expect(found).toHaveLength(0);
  });

  it("集約(候補・選択肢)を完全に復元する", async () => {
    db = await setup();
    const repo = createKyselyScheduleRepository(db);
    await repo.create(buildEvent({ id: "e1", guildId: "guild-1" }));

    const found = await repo.listOpenEventsByCandidateDate(
      "guild-1",
      startsAtOf(TODAY),
    );

    const event = found[0];
    expect(event?.guildId).toBe("guild-1");
    expect(event?.title).toBe("固定活動の日程調整");
    expect(event?.status).toBe("open");
    expect(event?.candidates).toHaveLength(1);
    expect(event?.candidates[0]?.startsAt).toEqual(startsAtOf(TODAY));
    expect(event?.responseOptions.map((o) => o.kind)).toEqual(["yes", "time"]);
    expect(event?.responseOptions[1]?.startMinute).toBe(21 * 60 + 30);
  });
});
