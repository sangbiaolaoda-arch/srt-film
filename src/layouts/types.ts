// 版式层类型契约：128 个版式 = 数据，不是 128 个手写组件。
// 一个渲染器解释所有版式；同一条数据同时驱动 DOM 播放与 canvas 导出。

import type { ChartKind } from "./charts";
import type { AssetId } from "./assets";

export type Group =
  // 编辑风（纸白 + 朱红）
  | "statement" | "number" | "compare" | "process" | "list"
  | "chart" | "image" | "quote" | "timeline" | "bookend"
  // 海报风（暗底 + 高饱和），只在 style === "poster" 时被选中
  | "poster-focus" | "poster-field" | "poster-geo" | "poster-nest";

/** 视觉风格。editorial = 纸白朱红极简；poster = 暗底高饱和 + canvas 特效。 */
export type Style = "editorial" | "poster";

/** 海报风的 canvas 特效。粒子三种运动方式 + 3D 投影 + 隧道 + 纯发光。 */
export type FxKind =
  | "particles-converge" | "particles-vortex" | "particles-burst"
  | "polyhedron" | "tunnel" | "glow" | "none";

export const POSTER_GROUPS: Group[] = ["poster-focus", "poster-field", "poster-geo", "poster-nest"];

export type SlotKind =
  // 文字
  | "headline" | "subhead" | "kicker" | "text" | "quote" | "attribution" | "literal" | "caption"
  // 数字
  | "bignum" | "num2" | "unit" | "delta"
  // 结构
  | "rule" | "panel" | "frame" | "arrow" | "axis" | "progress" | "divider" | "vignette"
  // 列表
  | "bullets" | "listnum" | "checklist" | "pills" | "tags"
  // 图表 / 图像 / 素材
  | "chart" | "image" | "icon" | "asset" | "device" | "dotmatrix" | "clock" | "calendar"
  // 标注
  | "label" | "source" | "meta" | "badge";

export type SizeCode = "xs" | "s" | "m" | "l" | "xl" | "xxl" | "huge" | "mega";
export type Tone = "ink" | "dim" | "accent" | "paper" | "hairline";

/** 内容槽位。box = 归一化网格区域 [x, y, w, h]，网格 cols×rows（默认 12×8）。 */
export interface Slot {
  k: SlotKind;
  box: [number, number, number, number];
  size?: SizeCode;
  tone?: Tone;
  align?: "start" | "center" | "end";
  /** 内容来源；缺省按 kind 推断 */
  src?: "headline" | "subhead" | "bignum" | "caption" | "left" | "right" | "bullet" | "number" | "none";
  /** 常量文案（如 kicker 的固定小标） */
  literal?: string;
  /** 图表种类 */
  chart?: ChartKind;
  /** 素材 id */
  asset?: AssetId;
  /** 该槽专属入场动效（缺省继承 layout.enter 轮转分配） */
  m?: string;
  /** 该槽强调动效 */
  mx?: string;
  opacity?: number;
  /** 需要的数据量：图表至少要有这么多个可溯源数字，否则该版式不合格 */
  needs?: number;
}

export interface Layout {
  id: string;
  name: string;
  group: Group;
  /** 默认入场动效池：按槽序轮转分配 */
  enter: string[];
  /** 强调动效（可选，作用于首个主槽） */
  emphasis?: string;
  /** 适用条件说明 */
  note?: string;
  /** 本版式至少需要多少个可溯源数字，否则不合格（图表类默认 3） */
  needs?: number;
  cols?: number;
  rows?: number;
  /** 视觉风格，缺省 editorial */
  style?: Style;
  /** 海报风的 canvas 特效（背景层） */
  fx?: FxKind;
  /** 特效强度 0..1，缺省 0.6 */
  fxStrength?: number;
  /** 底色，缺省按 style 取（编辑风纸白 / 海报风暗黑） */
  paper?: string;
  slots: Slot[];
}

/** 渲染内容：全部来自旁白，或来自导演覆写并带出处。 */
export interface RenderContent {
  headline: string;
  subhead?: string;
  bignum?: string;
  unit?: string;
  caption?: string;
  left?: string;
  right?: string;
  /** 由旁白按句读切分的要点（可溯源） */
  bullets: string[];
  /** 旁白中提取到的数字（可溯源） */
  numbers: number[];
  /** 拍序号（角标用） */
  beat: number;
  /** 导演是否显式标注为示意图形（唯一允许无数据画图的入口） */
  illustrative?: boolean;
}

export interface RenderOpts {
  width: number;
  height: number;
  paper?: string;
}
