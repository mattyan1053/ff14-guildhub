import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv } from "./env.js";

const validSource = {
  DISCORD_TOKEN: "dummy-token",
  DATABASE_DIALECT: "sqlite",
  DATABASE_URL: "file:/data/bot.sqlite3",
};

describe("loadEnv", () => {
  it("有効な環境変数を構造化して返す", () => {
    const env = loadEnv(validSource);

    expect(env).toEqual({
      discordToken: "dummy-token",
      database: { dialect: "sqlite", filePath: "/data/bot.sqlite3" },
    });
  });

  it("DATABASE_DIALECTとDATABASE_URLはデフォルト値で補完される", () => {
    const env = loadEnv({ DISCORD_TOKEN: "dummy-token" });

    expect(env.database).toEqual({
      dialect: "sqlite",
      filePath: "./data/bot.sqlite3",
    });
  });

  it("DISCORD_TOKEN未設定はエラーになる", () => {
    try {
      loadEnv({});
      expect.unreachable("EnvValidationError が投げられるべき");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const issues = (error as EnvValidationError).issues;
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain("DISCORD_TOKEN");
    }
  });

  it("sqlite以外のDATABASE_DIALECTを拒否する", () => {
    expect(() =>
      loadEnv({ ...validSource, DATABASE_DIALECT: "postgres" }),
    ).toThrow(/DATABASE_DIALECT/);
  });

  it("file:で始まらないDATABASE_URLを拒否する", () => {
    expect(() =>
      loadEnv({ ...validSource, DATABASE_URL: "/data/bot.sqlite3" }),
    ).toThrow(/must start with "file:"/);
  });

  it("パスが空のDATABASE_URLを拒否する", () => {
    expect(() => loadEnv({ ...validSource, DATABASE_URL: "file:" })).toThrow(
      /file path/,
    );
  });

  it("空白のみのトークンを未設定として扱う", () => {
    expect(() => loadEnv({ ...validSource, DISCORD_TOKEN: "   " })).toThrow(
      /DISCORD_TOKEN/,
    );
  });

  it("空白のみのDATABASE_URLはデフォルト値として扱う", () => {
    const env = loadEnv({ DISCORD_TOKEN: "dummy-token", DATABASE_URL: "  " });

    expect(env.database.filePath).toBe("./data/bot.sqlite3");
  });
});
