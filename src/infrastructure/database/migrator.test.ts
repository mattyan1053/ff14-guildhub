import type { Migration, MigrationProvider } from "kysely/migration";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "./connection.js";
import { migrateToLatest } from "./migrator.js";

function testProvider(
  migrations: Record<string, Migration>,
): MigrationProvider {
  return {
    getMigrations: () => Promise.resolve(migrations),
  };
}

const createExampleTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable("example")
      .addColumn("id", "integer", (col) => col.primaryKey())
      .execute();
  },
};

describe("migrateToLatest", () => {
  let db: AppDatabase | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("未適用のマイグレーションを適用する", async () => {
    db = createDatabase(":memory:");

    const applied = await migrateToLatest(
      db,
      testProvider({ "0001_example": createExampleTable }),
    );

    expect(applied).toBe(1);
  });

  it("適用済みのマイグレーションは再適用しない", async () => {
    db = createDatabase(":memory:");
    const provider = testProvider({ "0001_example": createExampleTable });

    await migrateToLatest(db, provider);
    const secondRun = await migrateToLatest(db, provider);

    expect(secondRun).toBe(0);
  });

  it("マイグレーション失敗時はエラーを投げる", async () => {
    db = createDatabase(":memory:");
    const failing: Migration = {
      up: () => Promise.reject(new Error("boom")),
    };

    await expect(
      migrateToLatest(db, testProvider({ "0001_failing": failing })),
    ).rejects.toThrow(/migration failed/i);
  });
});
