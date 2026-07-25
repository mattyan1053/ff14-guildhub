import {
  ActionRowBuilder,
  type BaseMessageOptions,
  type ButtonBuilder,
  type MessageActionRowComponentBuilder,
} from "discord.js";

// エフェメラルパネル(作成ビルダー/回答パネル)が共通で使う、コンポーネント木の
// 組み立て・読み戻しヘルパー。メッセージ自体を状態の真実源にしているため、payload
// を平坦化して custom_id / style / フィールドから状態を復元する処理が両者で同じになる。

export type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

/** 与えたコンポーネントで ActionRow を1つ作る。 */
export function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );
}

const MAX_BUTTONS_PER_ROW = 5;

/** items を最大5個/行のボタン行に分割する(各 item を toButton で描く)。 */
export function buttonRows<T>(
  items: readonly T[],
  toButton: (item: T) => ButtonBuilder,
): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < items.length; i += MAX_BUTTONS_PER_ROW) {
    rows.push(row(...items.slice(i, i + MAX_BUTTONS_PER_ROW).map(toButton)));
  }
  return rows;
}

/** payload 内の Builder / プレーンオブジェクトを一様に JSON 相当へ。 */
export function toData(value: unknown): { [key: string]: unknown } {
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

export interface RawComponent {
  type: number;
  custom_id?: string;
  label?: string;
  style?: number;
  disabled?: boolean;
  options?: { value: string; label: string; default?: boolean }[];
}

/** payload の全 ActionRow を平坦化して子コンポーネント列を返す。 */
export function flatComponents(payload: BaseMessageOptions): RawComponent[] {
  const out: RawComponent[] = [];
  for (const rowValue of payload.components ?? []) {
    const rowData = toData(rowValue) as { components?: unknown[] };
    for (const comp of rowData.components ?? []) {
      out.push(comp as RawComponent);
    }
  }
  return out;
}
