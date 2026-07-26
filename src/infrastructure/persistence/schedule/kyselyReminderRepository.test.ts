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
const NOW_MINUTE = 21 * 60 + 30;

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
  /** 予定の作成チャンネル。リマインドの送信先とは別物。 */
  channelId?: string;
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
    channelId: opts.channelId ?? "channel-event",
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

  describe("reminders", () => {
    it("upsert した設定を find で復元する", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));

      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: 1290,
      });

      expect(await repo.reminders.find("e1")).toEqual({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: 1290,
      });
    });

    it("同一予定への upsert は行を増やさず上書きする", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: 1290,
      });

      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-other",
        remindMinute: 600,
      });

      expect(await repo.reminders.find("e1")).toEqual({
        eventId: "e1",
        channelId: "channel-other",
        remindMinute: 600,
      });
      // 上書きされ、発火対象としても1件しか引けない
      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);
      expect(due).toHaveLength(1);
    });

    it("未設定の予定は find で null", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));

      expect(await repo.reminders.find("e1")).toBeNull();
    });

    it("delete で設定が消え、find が null になる", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: 1290,
      });

      await repo.reminders.delete("e1");

      expect(await repo.reminders.find("e1")).toBeNull();
    });

    it("存在しない予定の delete は no-op(例外を投げない)", async () => {
      db = await setup();
      const repo = createKyselyReminderRepository(db);

      await expect(repo.reminders.delete("missing")).resolves.toBeUndefined();
    });

    it("event を削除すると設定も cascade で消える", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: 1290,
      });

      await scheduleRepo.delete("e1");

      expect(await repo.reminders.find("e1")).toBeNull();
    });
  });

  describe("reminders.listDue", () => {
    it("リマインド未設定の予定は返さない", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));

      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);

      expect(due).toHaveLength(0);
    });

    it("送信時刻がまだ来ていない予定(remindMinute > minute)は返さない", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: NOW_MINUTE + 1,
      });

      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);

      expect(due).toHaveLength(0);
    });

    it("送信時刻ちょうど(remindMinute === minute)の予定は返す", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: NOW_MINUTE,
      });

      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);

      expect(due.map((d) => d.eventId)).toEqual(["e1"]);
    });

    it("送信時刻を過ぎた予定(remindMinute < minute)も返す(当日中の追い送り)", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: 60,
      });

      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);

      expect(due.map((d) => d.eventId)).toEqual(["e1"]);
    });

    it("候補日が別の日の予定は返さない", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(
        buildEvent({ id: "e1", dateValue: "2026-07-28" }),
      );
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: NOW_MINUTE,
      });

      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);

      expect(due).toHaveLength(0);
    });

    it("startsAt が null の候補しか持たない予定は返さない", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1", dateValue: null }));
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: NOW_MINUTE,
      });

      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);

      expect(due).toHaveLength(0);
    });

    it("open でない予定は返さない", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1" }));
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: NOW_MINUTE,
      });
      // EventStatus は現状 "open" のみなので、行を直接書き換えて非 open を作る。
      await db
        .updateTable("events")
        .set({ status: "closed" })
        .where("id", "=", "e1")
        .execute();

      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);

      expect(due).toHaveLength(0);
    });

    it("guild をまたいで発火対象を横断で返す", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(buildEvent({ id: "e1", guildId: "guild-1" }));
      await scheduleRepo.create(
        buildEvent({ id: "e2", guildId: "guild-1", guildSeq: 2 }),
      );
      await scheduleRepo.create(buildEvent({ id: "e3", guildId: "guild-2" }));
      for (const eventId of ["e1", "e2", "e3"]) {
        await repo.reminders.upsert({
          eventId,
          channelId: `channel-${eventId}`,
          remindMinute: NOW_MINUTE,
        });
      }

      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);

      expect(due.map((d) => d.eventId).sort()).toEqual(["e1", "e2", "e3"]);
    });

    it("送信先は event_reminders 側の channelId(予定の作成チャンネルではない)", async () => {
      db = await setup();
      const scheduleRepo = createKyselyScheduleRepository(db);
      const repo = createKyselyReminderRepository(db);
      await scheduleRepo.create(
        buildEvent({ id: "e1", channelId: "channel-event" }),
      );
      await repo.reminders.upsert({
        eventId: "e1",
        channelId: "channel-remind",
        remindMinute: NOW_MINUTE,
      });

      const due = await repo.reminders.listDue(startsAtOf(TODAY), NOW_MINUTE);

      expect(due).toEqual([{ eventId: "e1", channelId: "channel-remind" }]);
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
