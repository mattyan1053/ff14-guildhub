import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv } from "./env.js";

const validSource = {
  DISCORD_TOKEN: "dummy-token",
  DISCORD_APPLICATION_ID: "123456789012345678",
  DATABASE_DIALECT: "sqlite",
  DATABASE_URL: "file:/data/bot.sqlite3",
};

describe("loadEnv", () => {
  it("有効な環境変数を構造化して返す", () => {
    const env = loadEnv(validSource);

    expect(env).toEqual({
      discordToken: "dummy-token",
      discordApplicationId: "123456789012345678",
      database: { dialect: "sqlite", filePath: "/data/bot.sqlite3" },
    });
  });

  it("すべて未設定の場合、全項目のエラーをまとめて報告する", () => {
    try {
      loadEnv({});
      expect.unreachable("EnvValidationError が投げられるべき");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const issues = (error as EnvValidationError).issues;
      expect(issues).toHaveLength(4);
      expect(issues.join("\n")).toContain("DISCORD_TOKEN");
      expect(issues.join("\n")).toContain("DISCORD_APPLICATION_ID");
      expect(issues.join("\n")).toContain("DATABASE_DIALECT");
      expect(issues.join("\n")).toContain("DATABASE_URL");
    }
  });

  it("DISCORD_APPLICATION_IDが数値でない場合エラーになる", () => {
    expect(() =>
      loadEnv({ ...validSource, DISCORD_APPLICATION_ID: "not-a-snowflake" }),
    ).toThrow(/numeric Discord snowflake/);
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
});
