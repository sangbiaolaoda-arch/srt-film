import type { Layout, RenderContent } from "../layouts/types";

/** 一拍：版式 + 内容 + 时间区间。
 *  start/end 是 SRT 的绝对秒；tlStart 是它在 GSAP 时间轴上的起点
 *  （因为拍间有 0.25s 交叠，两者不等）。缺省时按 start 处理。 */
export interface Shot {
  layout: Layout;
  content: RenderContent;
  start: number;
  end: number;
  tlStart?: number;
  /** 本拍来自哪些 SRT cue（溯源用，对应 Render Plan 的 sourceCueIds） */
  cueIds?: number[];
}
