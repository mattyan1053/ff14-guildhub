import { describe, expect, it } from "vitest";
import { decode, encodePanel } from "./customId.js";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("customId encode/decode", () => {
  it("panelをencode→decodeするとactionとeventIdが戻る", () => {
    const decoded = decode(encodePanel("event-1"));

    expect(decoded).toEqual({ action: "panel", eventId: "event-1" });
  });

  it("encodePanelの書式はsch:v1:panel:<eventId>", () => {
    expect(encodePanel("event-1")).toBe("sch:v1:panel:event-1");
  });

  it("encodePanelに36文字UUIDを渡しても100文字以下に収まる", () => {
    expect(encodePanel(UUID).length).toBeLessThanOrEqual(100);
  });

  it("別NSのcustom_idはnullになる", () => {
    expect(decode("foo:v1:panel:x")).toBeNull();
  });

  it("別バージョンのcustom_idはnullになる", () => {
    expect(decode("sch:v2:panel:x")).toBeNull();
  });

  it("未知アクションのcustom_idはnullになる", () => {
    expect(decode("sch:v1:unknown:x")).toBeNull();
  });

  it("パーツ不足のcustom_idはnullになる", () => {
    expect(decode("sch:v1:panel")).toBeNull();
    expect(decode("sch:v1:panel:x:extra")).toBeNull();
  });

  it("空文字はnullになる", () => {
    expect(decode("")).toBeNull();
  });
});
