export interface Env {
  readonly discordToken: string;
  readonly discordApplicationId: string;
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

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

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

  const discordApplicationId = source.DISCORD_APPLICATION_ID?.trim();
  if (!discordApplicationId) {
    issues.push(
      "DISCORD_APPLICATION_ID is required (application ID from the Discord Developer Portal)",
    );
  } else if (!SNOWFLAKE_PATTERN.test(discordApplicationId)) {
    issues.push("DISCORD_APPLICATION_ID must be a numeric Discord snowflake");
  }

  const dialect = source.DATABASE_DIALECT?.trim();
  if (dialect !== "sqlite") {
    issues.push(
      `DATABASE_DIALECT must be "sqlite" (got: ${dialect ?? "unset"})`,
    );
  }

  const databaseUrl = source.DATABASE_URL?.trim();
  let filePath: string | undefined;
  if (!databaseUrl) {
    issues.push('DATABASE_URL is required (e.g. "file:/data/bot.sqlite3")');
  } else if (!databaseUrl.startsWith("file:")) {
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

  if (
    issues.length > 0 ||
    !discordToken ||
    !discordApplicationId ||
    !filePath
  ) {
    throw new EnvValidationError(issues);
  }

  return {
    discordToken,
    discordApplicationId,
    database: { dialect: "sqlite", filePath },
  };
}
