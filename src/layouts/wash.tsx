// 底色层（wash）：把「死白的纸」换成「有光的纸」。
//
// 为什么单独一层：此前每拍的底就是一次 fillRect 的纯色（#faf9f6 / #0b0b0f），
// 整屏只有一种明度，文字和图形再精致也像贴在纸上 —— 这是「一眼假」的主因之一。
// 真实印刷品和屏幕画面都不是单一明度：纸有纤维走向、有侧光、有中心到边缘的衰减。
//
// 技法出处（均为本轮 Agent-Reach 实抓资料，非自创）：
//   · CSS-Tricks《Grainy Gradients》— feTurbulence 噪点 + 渐变叠加、混合模式控制强度
//     https://css-tricks.com/grainy-gradients/
//   · Adobe《How to design a poster》Step 5 — 底色 / 主色 / 强调色三色制，
//     「最重要的元素应当是画面里对比度最高的那个」
//     https://www.adobe.com/express/learn/blog/poster-layout-design
//   · 手册 04《色彩脚本与美术指导》— 相邻拍色相微移形成色彩弧线，全片读作一部片
//   · 维基《Swiss Style》— 留白与不对称：底色不是背景，是构图的负空间
//     https://en.wikipedia.org/wiki/Swiss_Style_(design)
//
// 实现约束：纯 SVG，不用 foreignObject / <image>；id 必须带拍号（多拍图层同处
// 一棵 DOM，重复 id 会全部解析到第一层）；全部确定性 —— 无随机、无时间依赖。

import { colorsOf } from "./render";
import { CutoutMask, type Rect } from "./cutout";
import type { Style } from "./types";
import { resolveProfile, type StyleProfileId } from "../styles/style-system";

interface WashProps {
  /** 拍号：驱动色彩脚本档位与光位轮转 */
  beat: number;
  style?: Style;
  /** 版式显式指定的底色；给了就用它当基调，不再走色彩脚本 */
  paper?: string;
  /** 要让出透明度的矩形（photo 槽）。给了就在这三层 rect 上加挖洞遮罩 ——
   *  wash 是三层**不透明**满幅 rect，不挖洞的话画在 SVG 之下的照片永远看不见。 */
  cutouts?: Rect[];
}

/** 色彩脚本 · 编辑风：四档暖/冷纸，相邻拍只差几度色相 —— 看得见变化，读得出一体。 */
const PAPER_RAMP = [
  ["#fdfbf6", "#f0eadd"], // 暖纸（主调）
  ["#fafaf8", "#ebeeec"], // 冷纸
  ["#fdf9f6", "#f2e7e2"], // 微粉
  ["#fbfaf4", "#edf0e7"], // 微绿
] as const;

/** 色彩脚本 · 扁平矢量风：四档亮底，暖白到奶白，平涂感。 */
const FLAT_RAMP = [
  ["#fffaf3", "#f6efe3"],
  ["#fdf7f4", "#f3ece6"],
  ["#fff8f2", "#f7ece2"],
  ["#fdfbf5", "#f1f0e8"],
] as const;

/** 色彩脚本 · 图表动态图形风：四档近白底，极淡冷调，保持「屏幕截图」般的干净。 */
const WHITE_RAMP = [
  ["#ffffff", "#f6f8fb"],
  ["#ffffff", "#f4f7fa"],
  ["#ffffff", "#f7f9fb"],
  ["#ffffff", "#f3f6f9"],
] as const;

/** 按风格档返回底色层的光照 / 暗角 / 提压暗参数。 */
function washCfg(style: StyleProfileId): {
  ramp: readonly (readonly [string, string])[];
  lightColor: string;
  lightOpacity: number;
  vigOpacity: number;
  lift: number;
  drop: number;
} {
  switch (style) {
    case "flat-vector":
      return { ramp: FLAT_RAMP, lightColor: "#fff7ec", lightOpacity: 0.42, vigOpacity: 0.1, lift: 0.05, drop: -0.08 };
    case "chart-motion":
      return { ramp: WHITE_RAMP, lightColor: "#ffffff", lightOpacity: 0.22, vigOpacity: 0.06, lift: 0.03, drop: -0.04 };
    case "editorial":
    default:
      return { ramp: PAPER_RAMP, lightColor: "#fffdf6", lightOpacity: 0.5, vigOpacity: 0.16, lift: 0.02, drop: -0.055 };
  }
}

/** 光位轮转：左上 / 右上 / 左下 / 右下。 */
const LIGHT_POS = [
  [0.22, 0.18],
  [0.82, 0.2],
  [0.26, 0.84],
  [0.78, 0.8],
] as const;

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** 按比例明暗：amt>0 提亮，amt<0 压暗。用于从一个基色推出渐变另一端。 */
function shade(hex: string, amt: number): string {
  const n = hex.replace("#", "");
  const parts = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  const r = parts[0] ?? 0;
  const g = parts[1] ?? 0;
  const b = parts[2] ?? 0;
  const mix = (c: number) => (amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `#${[mix(r), mix(g), mix(b)].map((c) => clamp255(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 满版底色：线性渐变（一侧受光）+ 大半径柔光斑 + 边缘衰减。
 * 三样都刻意做轻 —— 它的作用是让画面「有空间」，不是自己抢戏。
 */
export function WashLayer({ beat, style, paper, cutouts = [] }: WashProps): JSX.Element {
  const p = resolveProfile(style);
  const C = colorsOf(style);
  const cfg = washCfg(p.id);
  const ramp = cfg.ramp;
  const idx = paper ? -1 : (((beat - 1) % ramp.length) + ramp.length) % ramp.length;

  // 渐变两端：给了 paper 就从 paper 推出；否则取色彩脚本档位。
  let from: string;
  let to: string;
  if (paper) {
    from = shade(paper, cfg.lift);
    to = shade(paper, cfg.drop);
  } else {
    const pair = ramp[idx]!;
    from = pair[0];
    to = pair[1];
  }

  const [lx, ly] = LIGHT_POS[(beat - 1) % LIGHT_POS.length]!;
  const gid = `wash-g-${beat}`;
  const lid = `wash-l-${beat}`;
  const vid = `wash-v-${beat}`;
  // 挖洞遮罩（只在有 photo 槽时存在）：没有它这三层不透明 rect 会把照片盖死。
  const mid = `wash-cut-${beat}`;
  const mask = cutouts.length > 0 ? `url(#${mid})` : undefined;
  // 柔光颜色：沿风格档取（图表风近白、扁平风暖白、编辑风暖白），不能用强调色，否则每拍都在发光
  const lightColor = cfg.lightColor;
  const lightOpacity = cfg.lightOpacity;

  return (
    <g data-wash="">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.42" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <radialGradient id={lid} cx={lx} cy={ly} r="0.92">
          <stop offset="0" stopColor={lightColor} stopOpacity={lightOpacity} />
          <stop offset="0.62" stopColor={lightColor} stopOpacity={lightOpacity * 0.28} />
          <stop offset="1" stopColor={lightColor} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={vid} cx="0.5" cy="0.46" r="0.78">
          <stop offset="0.55" stopColor={C.paper} stopOpacity={0} />
          <stop offset="1" stopColor={C.paper} stopOpacity={cfg.vigOpacity} />
        </radialGradient>
        {mask && <CutoutMask id={mid} rects={cutouts} />}
      </defs>
      <rect x={0} y={0} width={1280} height={720} fill={`url(#${gid})`} mask={mask} />
      <rect x={0} y={0} width={1280} height={720} fill={`url(#${lid})`} mask={mask} />
      {/* 边缘衰减：压住四角，把视线收回中心 —— 底色自带的「暗角」，比后期层更早生效 */}
      <rect x={0} y={0} width={1280} height={720} fill={`url(#${vid})`} mask={mask} />
    </g>
  );
}
