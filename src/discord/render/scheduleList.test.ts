import { type BaseMessageOptions, ComponentType } from "discord.js";
import { describe, expect, it } from "vitest";
import type { ScheduleEventListItem } from "../../application/schedule/ports/scheduleRepository.js";
import { LIST_SELECT } from "../customId.js";
import { renderScheduleList } from "./scheduleList.js";

function item(guildSeq: number, title: string): ScheduleEventListItem {
  return { id: `evt-${guildSeq}`, guildSeq, title, status: "open" };
}

function toJson(value: unknown): { [key: string]: unknown } {
  if (
    value &&
    typeof (value as { toJSON?: () => unknown }).toJSON === "function"
  ) {
    return (value as { toJSON: () => unknown }).toJSON() as {
      [key: string]: unknown;
    };
  }
  return (value ?? {}) as { [key: string]: unknown };
}

interface RawSelect {
  type: number;
  custom_id?: string;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

function selectMenu(payload: BaseMessageOptions): RawSelect | undefined {
  for (const row of payload.components ?? []) {
    const json = toJson(row) as { components?: unknown[] };
    for (const comp of json.components ?? []) {
      const raw = comp as RawSelect;
      if (raw.type === ComponentType.StringSelect) {
        return raw;
      }
    }
  }
  return undefined;
}

function firstEmbed(payload: BaseMessageOptions): {
  title?: string;
  description?: string;
  footer?: { text: string };
} {
  return toJson(payload.embeds?.[0]);
}

describe("renderScheduleList", () => {
  it("Embed のタイトルに件数を出す", () => {
    const payload = renderScheduleList([
      item(3, "固定練習"),
      item(2, "レイド"),
    ]);
    expect(firstEmbed(payload).title).toBe("📋 日程調整一覧 (2件)");
  });

  it("説明に番号とタイトルを並べる", () => {
    const payload = renderScheduleList([
      item(3, "固定練習"),
      item(1, "お試し会"),
    ]);
    const description = firstEmbed(payload).description ?? "";
    expect(description).toContain("#3  固定練習");
    expect(description).toContain("#1  お試し会");
  });

  it("選択メニューの custom_id は LIST_SELECT、value は eventId", () => {
    const payload = renderScheduleList([item(3, "固定練習")]);
    const menu = selectMenu(payload);
    expect(menu?.custom_id).toBe(LIST_SELECT);
    expect(menu?.options?.[0]?.value).toBe("evt-3");
    expect(menu?.options?.[0]?.label).toBe("#3 固定練習");
  });

  it("25件を超えると選択肢は25件までにし、フッターで案内する", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      item(30 - i, `会${30 - i}`),
    );
    const payload = renderScheduleList(many);
    expect(selectMenu(payload)?.options?.length).toBe(25);
    expect(firstEmbed(payload).footer?.text).toContain("/schedule show");
  });
});
