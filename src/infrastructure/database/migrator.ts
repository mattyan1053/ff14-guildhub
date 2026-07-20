import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileMigrationProvider,
  type MigrationProvider,
  Migrator,
} from "kysely/migration";
import type { AppDatabase } from "./connection.js";

const defaultMigrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

async function directoryExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function migrateToLatest(
  db: AppDatabase,
  provider?: MigrationProvider,
): Promise<number> {
  let resolvedProvider = provider;
  if (!resolvedProvider) {
    // ビルド成果物にはマイグレーションが1件もない間はディレクトリ自体が存在しない
    if (!(await directoryExists(defaultMigrationsDir))) {
      console.log("migrations: nothing to apply (no migrations directory)");
      return 0;
    }
    resolvedProvider = new FileMigrationProvider({
      fs,
      path,
      migrationFolder: defaultMigrationsDir,
    });
  }

  const migrator = new Migrator({ db, provider: resolvedProvider });
  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    console.log(
      `migrations: ${result.migrationName} ${result.status.toLowerCase()}`,
    );
  }

  if (error) {
    throw new Error("Database migration failed", { cause: error });
  }

  return (results ?? []).filter((result) => result.status === "Success").length;
}
