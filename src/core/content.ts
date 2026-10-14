// 内容构建：把一拍旁白变成渲染内容。所有文字、数字都来自旁白本身（或带出处的覆写）。

import type { Beat } from "./beats";
import type { BeatScene } from "./compose";
import { extractNumbers } from "./trace";
import type { RenderContent } from "../layouts/types";

const READS = /[。！？!?…，、；：,;:\n]/;

/** 按句读切要点；纯旁白来源，可溯源。 */
export function splitBullets(text: string, max = 4): string[] {
  return text
    .split(READS)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, max);
}

export function buildContent(scene: BeatScene, beat: Beat, illustrative = false): RenderContent {
  const nums = extractNumbers(beat.text);
  const bignum = scene.bigNumber?.raw ?? nums[0]?.raw;
  return {
    headline: scene.headline,
    subhead: undefined,
    bignum,
    unit: nums[0]?.unit,
    caption: splitBullets(beat.text, 2)[1],
    left: splitBullets(beat.text, 2)[0],
    right: splitBullets(beat.text, 4)[1],
    bullets: splitBullets(beat.text, 4),
    numbers: nums.map((n) => n.value),
    numberTokens: nums,
    beat: beat.index,
    illustrative,
  };
}
