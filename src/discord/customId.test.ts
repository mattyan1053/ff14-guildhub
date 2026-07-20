import { describe, expect, it } from "vitest";
import { decode, encodeAnswer, encodePage, encodePanel } from "./customId.js";

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";

describe("customId encode/decode", () => {
  it("panelをencode→decodeするとactionとeventIdが戻る", () => {
    const decoded = decode(encodePanel("event-1"));

    expect(decoded).toEqual({ action: "panel", eventId: "event-1" });
  });

  it("answerをencode→decodeするとcandidateIdまで戻る", () => {
    const decoded = decode(encodeAnswer("event-1", "cand-1"));

    expect(decoded).toEqual({
      action: "answer",
      eventId: "event-1",
      candidateId: "cand-1",
    });
  });

  it("pageをencode→decodeするとpageが数値で戻る", () => {
    const decoded = decode(encodePage("event-1", 2));

    expect(decoded).toEqual({ action: "page", eventId: "event-1", page: 2 });
    expect(decoded?.page).toBe(2);
    expect(typeof decoded?.page).toBe("number");
  });

  it("encodePanelの書式はsch:v1:panel:<eventId>", () => {
    expect(encodePanel("event-1")).toBe("sch:v1:panel:event-1");
  });

  it("encodeAnswerの書式はsch:v1:answer:<eventId>:<candidateId>", () => {
    expect(encodeAnswer("event-1", "cand-1")).toBe(
      "sch:v1:answer:event-1:cand-1",
    );
  });

  it("encodePageの書式はsch:v1:page:<eventId>:<page>", () => {
    expect(encodePage("event-1", 3)).toBe("sch:v1:page:event-1:3");
  });

  it("encodeAnswerに36文字UUIDを2つ渡しても100文字以下に収まる", () => {
    const encoded = encodeAnswer(UUID, UUID2);

    expect(encoded.length).toBeLessThanOrEqual(100);
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
    expect(decode("sch:v1:answer:event-1")).toBeNull();
    expect(decode("sch:v1:page:event-1")).toBeNull();
  });

  it("空文字はnullになる", () => {
    expect(decode("")).toBeNull();
  });
});
