// 版式层类型契约：128 个版式 = 数据，不是 128 个手写组件。
// 一个渲染器解释所有版式；同一条数据同时驱动 DOM 播放与 canvas 导出。

import type { ChartKind } from "./charts";
import type { AssetId } from "./assets";
import type { FigureKind } from "./figures";
import type { NumToken } from "../core/trace";

export type Group =
  // 编辑风（纸白 + 朱红）
  | "statement" | "number" | "compare" | "process" | "list"
  | "chart" | "image" | "quote" | "timeline" | "bookend" | "figure"
  // 扁平矢量叙事风（明亮平涂 + 粗描边 + 圆角），只在 style === "flat-vector" 时被选中
  | "poster-focus" | "poster-field" | "poster-geo" | "poster-nest";

/** 视觉风格档（Phase 5 三系）。editorial = 纸白朱红极简；flat-vector = 明亮扁平矢量；
 *  chart-motion = 白底数据图表。三系共享构图逻辑，只换风格 token（见 styles/style-system.ts）。 */
export type Style = "editorial" | "flat-vector" | "chart-motion";

/** 海报风的 canvas 特效。粒子三种运动方式 + 3D 投影 + 隧道 + 纯发光。 */
export type FxKind =
  | "particles-converge" | "particles-vortex" | "particles-burst"
  | "polyhedron" | "tunnel" | "glow"
  // 亮底专用（三系底色全是亮的，见 effects.ts 的 onLight 说明）：
  // drift-motes 浮尘缓漂（扁平风色粉颗粒）· grid-pulse 网格逐点脉冲（图表风）
  // · paper-sheen 纸面掠光（编辑风：大面积低对比，才看得出又不抢字）
  | "drift-motes" | "grid-pulse" | "paper-sheen"
  | "none";

/**
 * 编辑风满版 SVG 图形背景（画法套装 A 组移植）：确定性纯图形，无 filter，
 * 位于 decor 之下、底色之上。给「文字浮在素底」的画面一个构图主体。
 */
export type BgKind = "dots-fade" | "halftone" | "contour" | "rays" | "waves";

/**
 * 底色情绪（BgMood）：由叙事角色派生，让整片底色按「叙事段落」而非「拍号」切换色调，
 * 同一个角色的所有拍读到同一档色，读出色彩弧线。warm 暖/收束 · cool 冷/证据 ·
 * close 亲密收尾 · neutral 中性过渡。
 */
export type BgMood = "warm" | "cool" | "close" | "neutral";

/** 扁平矢量叙事风的版式组（明亮平涂 + 粗描边 + 圆角）。 */
export const FLATVECTOR_GROUPS: Group[] = ["poster-focus", "poster-field", "poster-geo", "poster-nest"];

export type SlotKind =
  // 文字
  | "headline" | "subhead" | "kicker" | "text" | "quote" | "attribution" | "literal" | "caption"
  // 数字
  | "bignum" | "num2" | "unit" | "delta"
  // 结构
  | "rule" | "panel" | "frame" | "arrow" | "axis" | "progress" | "divider" | "vignette"
  // 列表
  | "bullets" | "listnum" | "checklist" | "pills" | "tags"
  // 图表 / 图像 / 素材 / 概念图形 / 真照片
  | "chart" | "image" | "icon" | "asset" | "device" | "dotmatrix" | "clock" | "calendar"
  | "figure" | "photo"
  // 标注
  | "label" | "source" | "meta" | "badge";

export type SizeCode = "xs" | "s" | "m" | "l" | "xl" | "xxl" | "huge" | "mega";
export type Tone = "ink" | "dim" | "accent" | "paper" | "hairline";

/**
 * 真正渲染文字的槽（与 render.tsx SlotNode 的 default/文本分支对齐）。
 * rule/divider/arrow/progress/axis 等结构件不渲染文字。
 *
 * 放在类型层而不是某个使用方内部，是因为**有两个互不相干的消费方**需要同一个事实：
 * 排版门禁（constraints：字放不放得下）与渲染器（frame：fx 前景层要避开这些矩形）。
 * 各写一份就会漂移 —— 上一轮「同一个色号三处字面量」是同一个教训。
 */
export const TEXT_SLOT_KINDS: ReadonlySet<SlotKind> = new Set<SlotKind>([
  "headline", "text", "quote", "caption", "subhead", "attribution", "source",
  "unit", "literal", "badge", "kicker", "label", "meta", "bignum", "num2",
  "bullets", "listnum", "checklist", "tags", "pills",
]);

/** 内容槽位。box = 归一化网格区域 [x, y, w, h]，网格 cols×rows（默认 12×8）。 */
export interface Slot {
  k: SlotKind;
  box: [number, number, number, number];
  size?: SizeCode;
  tone?: Tone;
  align?: "start" | "center" | "end";
  /** 内容来源；缺省按 kind 推断 */
  src?: "headline" | "subhead" | "bignum" | "caption" | "left" | "right" | "bullet" | "number" | "none";
  /** bullets/pills 专用：跳过前 N 条（前面几条已由同版式的其它槽承载）。
   *  存在原因：headline 只画首个句读、caption 只画第二个分句，第 3/4 分句
   *  本来无人承载 —— 无音轨成片里那些句子观众永远听不到。 */
  skipFirst?: number;
  /** 常量文案（如 kicker 的固定小标） */
  literal?: string;
  /** 图表种类 */
  chart?: ChartKind;
  /** 概念图形种类（不依赖数据，形状来自旁白语义） */
  figure?: FigureKind;
  /** 素材 id */
  asset?: AssetId;
  /** 该槽专属入场动效（缺省继承 layout.enter 轮转分配） */
  m?: string;
  /** 该槽强调动效 */
  mx?: string;
  opacity?: number;
  /** 直接指定色值（panel 色块构图用，如深蓝底 + 橙红条）。门禁仍以正文对比度兜底 */
  color?: string;
  /** 字距（px）。大字宽字距构图（如「遗 忘 的 形 状」）用 */
  tracking?: number;
  /** 逐字竖排：从槽位顶部向下排，每字一行高。中文竖排大字构图用 */
  vertical?: boolean;
  /** 需要的数据量：图表至少要有这么多个可溯源数字，否则该版式不合格 */
  needs?: number;
  /** 真照片槽：指定固定照片（双图对照的第二张等）。缺省吃本拍语义选图的结果 */
  photo?: import("../assets/photos").PhotoId;
  /** 照片上的纸色罩（0..1，压多重的纸色让文字可读；缺省 0.5） */
  tint?: number;
  /** cover 裁切的焦点（0..1，0 贴左/上，1 贴右/下；缺省居中）。双框取同一张的两处裁切用 */
  crop?: [number, number];
}

export interface CameraMove {
  /** 起止缩放（1 = 原尺寸）。缓推 1.0→1.06；后拉揭示 1.06→1.0 */
  scaleFrom?: number;
  scaleTo?: number;
  /** 起止平移（px，画面坐标系 1280×720）。摇／移配少量缩放防露边 */
  xFrom?: number;
  xTo?: number;
  yFrom?: number;
  yTo?: number;
}

export interface Layout {
  id: string;
  name: string;
  group: Group;
  /** 默认入场动效池：按槽序轮转分配 */
  enter: string[];
  /** 强调动效（可选，作用于首个主槽） */
  emphasis?: string;
  /** 环境动效（可选，作用于整拍图层、贯穿这一拍） */
  ambient?: string;
  /** 适用条件说明 */
  note?: string;
  /** 本版式至少需要多少个可溯源数字，否则不合格（图表类默认 3） */
  needs?: number;
  cols?: number;
  rows?: number;
  /** 视觉风格，缺省 editorial */
  style?: Style;
  /**
   * 专属场景 id：命中 KAOJIN_SCENES 注册表时，整拍由手绘满版场景渲染，
   * slots 被忽略。用于「一部片一套全新画面」的完全重做 —— 场景与台词一一对应，
   * 不进自动挑选池，只被导演覆写点名。
   */
  custom?: string;
  /** 旗舰版式（画法套装移植）：选版时与普通版式 1:1 交错插池，保证出现率 */
  flagship?: boolean;
  /** 本拍的入场转场 id（缺省按 stage 的轮转序列取） */
  transition?: string;
  /** 本拍的出场动效 id（缺省按 stage 的轮转序列取） */
  exit?: string;
  /**
   * 机位运动：整拍图层在镜内的持续线性运动（推／拉／摇／移）。
   * 这是「镜内 Δ」的来源 —— 没有它，静态构图 + 一次性入场 ≈ 幻灯片。
   * 作用于独立的内层容器，与转场／出场动效（作用于整拍图层）互不抢 transform。
   */
  camera?: CameraMove;
  /** 是否绘制母版装饰层（点阵 / 四角角标 / 进度条）。专属场景片应关闭，缺省开启 */
  decor?: boolean;
  /** 满版图形背景（编辑风）：dots-fade 圆点渐隐 / halftone 半调 / contour 山形 / rays 放射 / waves 水波 */
  bg?: BgKind;
  /** canvas 特效（前景层：画在内容之上、后期之下）。缺省按风格派生，见 StyleProfile.fxBias */
  fx?: FxKind;
  /** 特效强度 0..1，缺省 0.6 */
  fxStrength?: number;
  /** 特效主色，缺省 profile 的 ember。满版板式（v2）有自己的色板，特效必须纳入其中 */
  fxAccent?: string;
  /** 底色，缺省按 style 取（编辑风纸白 / 扁平风暖白 / 图表风纯白） */
  paper?: string;
  /**
   * 是否绘制满版底色层（wash）：受光渐变 + 柔光斑 + 边缘衰减，按拍号走色彩脚本。
   * 缺省开启 —— 纯色底是「一眼假」的主因之一。专属场景（custom）自动关闭。
   */
  wash?: boolean;
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
  /** 数字原文 token（raw 含单位与中文数字写法，如「四十秒」「120毫秒」）。
   *  numbers 只留 value 会丢掉写法 —— 满版数据条要显示原文才溯源。 */
  numberTokens?: NumToken[];
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
