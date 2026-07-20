import { describe, expect, it } from "vitest";
import { ScheduleValidationError } from "./errors.js";

describe("ScheduleValidationError", () => {
  it("issues を保持する", () => {
    const error = new ScheduleValidationError(["a", "b"]);

    expect(error.issues).toEqual(["a", "b"]);
  });

  it("name が ScheduleValidationError である", () => {
    const error = new ScheduleValidationError(["x"]);

    expect(error.name).toBe("ScheduleValidationError");
  });

  it("Error のインスタンスである", () => {
    const error = new ScheduleValidationError(["x"]);

    expect(error).toBeInstanceOf(Error);
  });

  it("message に issues の内容が含まれる", () => {
    const error = new ScheduleValidationError(["タイトルが空です"]);

    expect(error.message).toContain("タイトルが空です");
  });
});
