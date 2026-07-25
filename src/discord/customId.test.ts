import { describe, expect, it } from "vitest";
import {
  DELETE_CANCEL,
  decode,
  encodeDeleteConfirm,
  encodePanel,
} from "./customId.js";

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

describe("encodeDeleteConfirm / decode(delete)", () => {
  it("encodeDeleteConfirmの書式はsch:v1:delete:<eventId>", () => {
    expect(encodeDeleteConfirm("event-1")).toBe("sch:v1:delete:event-1");
  });

  it("deleteをencode→decodeするとactionとeventIdが戻る", () => {
    const decoded = decode(encodeDeleteConfirm("event-1"));

    expect(decoded).toEqual({ action: "delete", eventId: "event-1" });
  });

  it("encodeDeleteConfirmに36文字UUIDを渡しても100文字以下に収まる", () => {
    expect(encodeDeleteConfirm(UUID).length).toBeLessThanOrEqual(100);
  });

  it("deleteのパーツ不足・過多はnullになる", () => {
    expect(decode("sch:v1:delete")).toBeNull();
    expect(decode("sch:v1:delete:x:extra")).toBeNull();
  });
});

describe("DELETE_CANCEL", () => {
  it("状態を持たない固定custom_idである", () => {
    expect(DELETE_CANCEL).toBe("sch:v1:delete-cancel");
  });

  it("decode対象ではない(nullになる)", () => {
    // ルーターが定数一致で拾うため、decodeでは復元しない
    expect(decode(DELETE_CANCEL)).toBeNull();
  });
});
