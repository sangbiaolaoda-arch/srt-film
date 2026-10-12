// 构图规划器：为一拍选择版式（编辑风）。策略保持小集合，每个都有明确的视觉含义。
// 导演覆写是一等公民：覆写存在时，覆写优先于自动推断。

import type { Beat } from "./beats";
import { extractNumbers, isTraceable } from "./trace";

export type Layout =
  | "statement" // 大字陈述：整拍只有一句话
  | "number"    // 数字焦点：一个可溯源数字放大为主视觉
  | "contrast"; // 对照：两个短语左右并置

export interface BeatScene {
  beat: Beat;
  layout: Layout;
  headline: string; // 画面主文案（默认取拍文本，截断到安全长度）
  bigNumber?: { raw: string; unit?: string }; // layout=number 时
  left?: string;  // layout=contrast 时
  right?: string;
}

// 安全长度：编辑风大字下的显示宽度上限（全角=1，半角=0.5）
export const HEADLINE_MAX = 16;

export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.codePointAt(0)! > 0xff ? 1 : 0.5;
  return w;
}

// 画面 headline 截取：显示到第一个句读（句末或停顿标点）为止，去掉尾标点
const READS = "。！？!?…，、；：,;:\n";
export function displayHeadline(text: string): string {
  const t = text.trim();
  for (let i = 0; i < t.length; i++) {
    if (READS.includes(t[i]!)) return t.slice(0, i);
  }
  return t;
}

export function composeScenes(beats: Beat[]): BeatScene[] {
  return beats.map((beat) => composeScene(beat));
}

export function composeScene(beat: Beat): BeatScene {
  const nums = extractNumbers(beat.text);
  if (nums.length > 0) {
    const n = nums[0]!;
    return {
      beat,
      layout: "number",
      headline: beat.text,
      bigNumber: { raw: n.raw, unit: n.unit },
    };
  }
  return { beat, layout: "statement", headline: beat.text };
}

// 门禁：场景数字必须可溯源；headline 超长给出警告
export function validateScene(scene: BeatScene, overrideSource?: string): string[] {
  const errors: string[] = [];
  if (scene.bigNumber && !isTraceable(scene.bigNumber.raw, scene.beat.text, overrideSource)) {
    errors.push(`拍 ${scene.beat.index}：画面数字「${scene.bigNumber.raw}」在旁白中不存在（不可溯源）`);
  }
  const h = displayHeadline(scene.headline);
  if (displayWidth(h) > HEADLINE_MAX) {
    errors.push(`拍 ${scene.beat.index}：headline「${h}」显示宽度 ${displayWidth(h)} 超出安全区（${HEADLINE_MAX}），需缩短或分拍`);
  }
  return errors;
}
