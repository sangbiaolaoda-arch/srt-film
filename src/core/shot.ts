import type { Layout, RenderContent, CameraMove } from "../layouts/types";
import type { NarrativeRole } from "./compose";
import type { PhotoId } from "../assets/photos";
import type { SemanticEvent } from "../semantics/events";
import type { SemanticSlice } from "../semantics/types";

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
  /** Phase 8：schedule 按叙事角色裁决后的机位运动（null/undefined = 有意静止）。
   *  渲染链路（stage.tsx 时间轴 + frame.ts 导出同源）统一读它，不再读 layout.camera
   *  —— layout.camera 退化为「数据残留」，机位的生杀大权收归 schedule。 */
  camera?: CameraMove;
  /** Phase 1 语义层：本拍抽到的事件（每个都能回到 cue 的字符区间） */
  events?: SemanticEvent[];
  /** Phase 1/3 语义切片：本拍的语义布局 / 元素图 / 编排（比较、因果……统一一个字段）。
   *  存在 = 本拍走**组级运动**（渲染层因此有 <g data-group>，stage 按 MovePlan 编译）。
   *  派发键是 kind（阶段 tsx 的 movesFor / relationsFor 按它选编译逻辑）。 */
  semantic?: SemanticSlice;
  /** 规划记录（方案 §10.4）：本拍声明应用了哪些规则/模板/断言。
   *  这只是「声明证据」，是否真的生效由几何验算与浏览器校准证明。 */
  appliedRules?: string[];
}
