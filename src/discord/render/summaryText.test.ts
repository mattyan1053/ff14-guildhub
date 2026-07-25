import { describe, expect, it } from "vitest";
import { formatEventHeading } from "./summaryText.js";

describe("formatEventHeading", () => {
  it("絵文字とタイトルと連番を半角スペース2つで区切る", () => {
    expect(formatEventHeading({ title: "固定練習", guildSeq: 3 })).toBe(
      "📅 固定練習  #3",
    );
  });
});
