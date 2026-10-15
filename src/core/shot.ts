import type { Layout, RenderContent } from "../layouts/types";
import type { NarrativeRole } from "./compose";
import type { PhotoId } from "../assets/photos";

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
  /** Phase 4 叙事层：本拍的角色、目的与禁区（不臆造） */
  narrative?: { role: NarrativeRole; purpose: string; forbidden: string[] };
  /** Phase 7 跨镜头连续性：与上一拍共享的数字原文（enrichNarrative 派生）。
   *  非空 = 本拍视觉上继承上一拍的 motif（见 render/continuity.ts）。 */
  continuity?: string[];
  /** 缺陷 6：语义选图的结果（版式带 photo 槽时才挂；renderFrame 的 canvas 图像层消费） */
  photo?: PhotoId;
}
