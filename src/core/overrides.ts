// 导演覆写：一等公民数据。用户可对任意拍覆写版式、文案、主数字。
// 结构：以拍序号为 key 的 JSON。覆写永远优先于自动推断。
// 诚实约束：覆写数字必须提供 source（原文出处片段），否则门禁拒绝。

import type { Layout, BeatScene } from "./compose";
import type { Style } from "../layouts/types";

export interface BeatOverride {
  /** 指定版式 id，覆写优先于自动挑选 */
  layoutId?: string;
  layout?: Layout;
  /** 强制视觉风格，覆写优先于自动判定 */
  style?: Style;
  headline?: string;
  bigNumber?: string;      // 画面主数字（可改写形态，如 "85%"）
  source?: string;         // 出处：包含该数字的原文片段（溯源用）
  left?: string;
  right?: string;
  /**
   * 槽级入场动效覆写：{ 槽序号: 动效 id }。
   * 只作用于本拍的这一份版式副本，不写回 LAYOUT_BY_ID —— 同一版式被别的片子用时不受影响。
   * 缺省的槽仍按版式自带的 enter 池轮转。
   */
  animations?: Record<string, string>;
}

export type OverrideMap = Record<string, BeatOverride>;

export function applyOverride(scene: BeatScene, ov: BeatOverride): BeatScene {
  return {
    ...scene,
    layout: ov.layout ?? scene.layout,
    headline: ov.headline ?? scene.headline,
    bigNumber: ov.bigNumber
      ? { raw: ov.bigNumber, unit: scene.bigNumber?.unit }
      : scene.bigNumber,
    left: ov.left,
    right: ov.right,
  };
}
