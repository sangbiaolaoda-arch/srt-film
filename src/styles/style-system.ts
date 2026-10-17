// 风格系统（Phase 5）：三种视觉方向的 token 契约。
//
// 与「内容类型」解耦：同一份镜头内容可以由不同 StyleProfile 渲染出不同观感，
// 同一套 StyleProfile 也能套到不同主题上。板（v2.tsx）与装饰/底色层都只读取
// profile 的色板与图形语法 token，不写死任何颜色 —— 这样「同一段 SRT 在三种风格下
// 对照」才是真换皮不换构图逻辑。
//
// 三种风格：
//   editorial   编辑排版风：纸白 + 朱红 + 衬线，细线、网格、留白，克制运动。
//   flat-vector 扁平矢量叙事风：明亮平涂、粗描边、圆角、扁平填充，无纸纹，明快运动。
//   chart-motion 图表/动态图形风：白底 + 网格 + 坐标轴 + 等宽数字，数据感，揭示式运动。

import type { FxKind, Tone } from "../layouts/types";
import type { SemTone } from "../layouts/emphasis";

export type StyleProfileId = "editorial" | "flat-vector" | "chart-motion";

/** 全片风格档的选择顺序（UI 下拉、测试遍历用）。 */
export const PROFILE_ORDER: StyleProfileId[] = ["editorial", "flat-vector", "chart-motion"];

export interface StyleProfile {
  id: StyleProfileId;
  name: string;
  /** 板直接消费的具名色（与 v2.tsx 既有命名一一对应，板只换前缀不换构图）。 */
  paper: string;
  ink: string;
  accent: string;
  aux: string;
  dark: string;
  cream: string;
  ember: string;
  steel: string;
  blush: string;
  sand: string;
  clay: string;
  /** 字体族：大标题 / 正文 / 数字（图表风用等宽数字） */
  fontDisplay: string;
  fontText: string;
  fontNum: string;
  /** 图形语法 token */
  lineWidth: number;
  /** 填充矩形的圆角半径（扁平风大圆角，编辑风直角） */
  radius: number;
  /** 装饰/语法密度 0..1（网格疏密、角标繁简） */
  density: number;
  /** 动效节奏：>1 更利落明快，<1 更舒缓 */
  motionPace: number;
  /** 转场倾向：决定整片常用的转场家族 */
  transitionBias: "slide" | "wipe" | "mask" | "cut";
  /** 是否绘制数据网格（图表风） */
  grid: boolean;
  /** 是否绘制基准坐标轴（图表风） */
  axis: boolean;
  /** 是否使用圆角扁平形状（扁平矢量风） */
  rounded: boolean;
  /** 是否平涂（关闭纸纹/受光渐变，改纯色底） */
  flat: boolean;
  /** 数字是否使用等宽字体（图表风） */
  monoNum: boolean;
  /** 是否绘制纸纹质感（编辑风） */
  paperTexture: boolean;
  /** 语义强调色（与底色保持对比；不能只靠颜色传达信息，配合放大加粗） */
  sem: Record<SemTone, string>;
  /** Tone 调色板：槽位版式、装饰层、底色层消费 */
  tone: Record<Tone, string>;
  /**
   * 动效签名：板式没显式声明 fx 时由此派生（板式声明优先，"none" 是显式关闭）。
   * 三系各有一种「属于自己的动」，而不是把同一套粒子刷三遍 —— 那正是「敷衍」的另一种写法。
   */
  fxBias: FxKind;
  /** 动效强度 0..1：编辑风最克制（浮尘只是呼吸）、扁平风最外放 */
  fxStrength: number;
}

const SERIF = '"Source Han Serif SC","Noto Serif SC","Songti SC",SimSun,serif';
const SANS = '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
const MONO = '"JetBrains Mono","Roboto Mono",ui-monospace,SFMono-Regular,Menlo,monospace';

export const STYLE_PROFILES: Record<StyleProfileId, StyleProfile> = {
  "editorial": {
    id: "editorial",
    name: "编辑排版风",
    paper: "#f4f6f8", ink: "#0f141c", accent: "#c92a2a", aux: "#183153",
    dark: "#070a0e", cream: "#ffffff", ember: "#c92a2a", steel: "#22577a",
    blush: "#fde8e8", sand: "#f3f0e6", clay: "#e9ecef",
    fontDisplay: SERIF, fontText: SERIF, fontNum: SERIF,
    lineWidth: 2.5, radius: 0, density: 0.35, motionPace: 1.0, transitionBias: "slide",
    fxBias: "paper-sheen", fxStrength: 0.45,
    grid: false, axis: false, rounded: false, flat: false, monoNum: false, paperTexture: true,
    sem: { danger: "#a61e1e", cost: "#8f5c00", safe: "#137333", warm: "#c92a2a" },
    tone: { ink: "#0f141c", dim: "#5c6779", accent: "#c92a2a", paper: "#f4f6f8", hairline: "rgba(15,20,28,0.12)" },
  },
  "flat-vector": {
    id: "flat-vector",
    name: "扁平矢量叙事风",
    paper: "#f8f9fa", ink: "#0b132b", accent: "#e63946", aux: "#1d3557",
    dark: "#050811", cream: "#ffffff", ember: "#e63946", steel: "#457b9d",
    blush: "#fed0d0", sand: "#f1faee", clay: "#a8dadc",
    fontDisplay: SANS, fontText: SANS, fontNum: SANS,
    lineWidth: 6, radius: 18, density: 0.5, motionPace: 1.18, transitionBias: "wipe",
    fxBias: "drift-motes", fxStrength: 0.7,
    grid: false, axis: false, rounded: true, flat: true, monoNum: false, paperTexture: false,
    sem: { danger: "#b7094c", cost: "#99582a", safe: "#007200", warm: "#e63946" },
    tone: { ink: "#0b132b", dim: "#6c757d", accent: "#e63946", paper: "#f8f9fa", hairline: "rgba(11,19,43,0.12)" },
  },
  "chart-motion": {
    id: "chart-motion",
    name: "图表动态图形风",
    paper: "#f0f4f8", ink: "#0a192f", accent: "#0066cc", aux: "#028090",
    dark: "#020c1b", cream: "#ffffff", ember: "#0066cc", steel: "#1b4965",
    blush: "#e0f2fe", sand: "#e2e8f0", clay: "#bee3f8",
    fontDisplay: SANS, fontText: SANS, fontNum: MONO,
    lineWidth: 3, radius: 4, density: 0.7, motionPace: 0.9, transitionBias: "mask",
    fxBias: "grid-pulse", fxStrength: 0.5,
    grid: true, axis: true, rounded: false, flat: true, monoNum: true, paperTexture: false,
    sem: { danger: "#c53030", cost: "#975a16", safe: "#22543d", warm: "#0066cc" },
    tone: { ink: "#0a192f", dim: "#4a5568", accent: "#0066cc", paper: "#f0f4f8", hairline: "rgba(10,25,47,0.14)" },
  },
};

/** 解析风格档；非法/缺省回退编辑风。 */
export function resolveProfile(id: string | undefined | null): StyleProfile {
  return (id && id in STYLE_PROFILES ? STYLE_PROFILES[id as StyleProfileId] : STYLE_PROFILES.editorial);
}

/** 人类可读的风格名。 */
export function profileLabel(id: StyleProfileId): string {
  return STYLE_PROFILES[id].name;
}
