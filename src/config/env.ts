export interface Env {
  readonly discordToken: string;
  readonly database: {
    readonly dialect: "sqlite";
    readonly filePath: string;
  };
}

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Invalid environment variables:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

const DEFAULT_DATABASE_URL = "file:./data/bot.sqlite3";

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const issues: string[] = [];

  const discordToken = source.DISCORD_TOKEN?.trim();
  if (!discordToken) {
    issues.push(
      "DISCORD_TOKEN is required (bot token from the Discord Developer Portal)",
    );
  }

  const dialect = source.DATABASE_DIALECT?.trim() || "sqlite";
  if (dialect !== "sqlite") {
    issues.push(`DATABASE_DIALECT must be "sqlite" (got: ${dialect})`);
  }

  const databaseUrl = source.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  let filePath: string | undefined;
  if (!databaseUrl.startsWith("file:")) {
    issues.push(
      'DATABASE_URL must start with "file:" while DATABASE_DIALECT is "sqlite"',
    );
  } else {
    filePath = databaseUrl.slice("file:".length);
    if (filePath.length === 0) {
      issues.push(
        'DATABASE_URL must contain a file path after the "file:" prefix',
      );
    }
  }

  if (issues.length > 0 || !discordToken || !filePath) {
    throw new EnvValidationError(issues);
  }

  return {
    discordToken,
    database: { dialect: "sqlite", filePath },
  };
}
