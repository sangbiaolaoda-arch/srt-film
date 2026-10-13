// 版式渲染器：把「版式数据 + 内容」渲染成纯 SVG。
// 同一份输出同时服务播放（DOM 里被 GSAP 驱动）与导出（序列化后画进 canvas）。
// 严禁 foreignObject / <image> / 外链 —— 否则 canvas 会被污染。

import { Fragment } from "react";
import { Chart } from "./charts";
import { Asset } from "./assets";
import { Figure } from "./figures";
import type { Layout, RenderContent, Slot, Style, Tone } from "./types";
import { displayHeadline, displayWidth } from "../core/compose";

/** 编辑风色板：纸白 + 朱红。 */
export const COLORS: Record<Tone, string> = {
  ink: "#1c1b18",
  dim: "#8a867c",
  accent: "#c8401f",
  paper: "#faf9f6",
  hairline: "rgba(28,27,24,0.14)",
};

/** 海报风色板：暗底 + 电光青绿。 */
export const COLORS_POSTER: Record<Tone, string> = {
  ink: "#eceae6",
  dim: "#8b8a9c",
  accent: "#38e8c6",
  paper: "#0b0b0f",
  hairline: "rgba(236,234,230,0.16)",
};

export function colorsOf(style?: Style): Record<Tone, string> {
  return style === "poster" ? COLORS_POSTER : COLORS;
}

const FONT_SIZE = { xs: 14, s: 18, m: 24, l: 34, xl: 48, xxl: 72, huge: 104, mega: 168 } as const;
const SERIF = '"Source Han Serif SC","Noto Serif SC","Songti SC",SimSun,serif';
const SANS = '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';

/** 英文/数字按 0.55 字宽计，其余按 1 字宽计 —— 决定一行能放多少字。 */
function charWidth(ch: string): number {
  return ch.codePointAt(0)! > 0xff ? 1 : 0.55;
}

function wrapText(text: string, sizePx: number, maxWidth: number): string[] {
  const maxUnits = maxWidth / sizePx;
  const chars = Array.from(text);
  const widths = chars.map(charWidth);

  // 贪心：能塞就塞，得到最少行数
  const greedy: string[] = [];
  let line = "";
  let used = 0;
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i]!;
    if (used + w > maxUnits && line) {
      greedy.push(line);
      line = chars[i]!;
      used = w;
    } else {
      line += chars[i]!;
      used += w;
    }
  }
  if (line) greedy.push(line);

  // 中文标题的孤字行很难看：15 个字会被贪心切成 14+1，最后一行只剩一个「恶」。
  // 只在这种情况（不止一行、且最后一行 ≤ 2 个字符）重排一次 —— 把字符尽量均匀摊到
  // 同样多的行数里；摊完只要有任何一行放不下，就退回贪心结果，绝不比原来更差。
  const lastLen = Array.from(greedy[greedy.length - 1] ?? "").length;
  if (greedy.length < 2 || lastLen > 2) return greedy;

  const n = greedy.length;
  const balanced: string[] = [];
  let at = 0;
  for (let ln = 0; ln < n; ln++) {
    const charsLeft = chars.length - at;
    const rowsLeft = n - ln;
    const want = Math.max(1, Math.round(charsLeft / rowsLeft));
    let u = 0;
    let k = 0;
    while (k < want && at + k < chars.length && u + widths[at + k]! <= maxUnits + 1e-9) {
      u += widths[at + k]!;
      k++;
    }
    if (k === 0) return greedy; // 一个都放不下：退回贪心
    balanced.push(chars.slice(at, at + k).join(""));
    at += k;
  }
  if (at < chars.length) return greedy; // 没摊完：退回贪心
  return balanced;
}

function textAnchor(align: Slot["align"]): "start" | "middle" | "end" {
  return align === "center" ? "middle" : align === "end" ? "end" : "start";
}

interface Ctx {
  content: RenderContent;
  layout: Layout;
  numericIndex: number; // 数字槽出现顺序（bignum / num2 共用）
}

function slotText(slot: Slot, ctx: RenderContent): string {
  const { headline, subhead, caption, left, right, bignum, unit } = ctx;
  if (slot.literal) return slot.literal;
  switch (slot.src) {
    case "headline": return headline;
    case "subhead": return subhead ?? caption ?? headline;
    case "caption": return caption ?? subhead ?? headline;
    case "left": return left ?? headline;
    case "right": return right ?? caption ?? headline;
    case "bignum": return bignum ?? "";
    case "none": return "";
    default: break;
  }
  switch (slot.k) {
    case "headline": case "text": case "quote": return headline;
    case "subhead": return subhead ?? caption ?? headline;
    case "kicker": case "label": case "badge": case "meta": return "";
    case "bignum": return bignum ?? "";
    case "unit": return unit ?? "";
    case "caption": return caption ?? headline;
    case "attribution": return caption ?? "— 旁白";
    case "source": return "数据来自旁白";
    default: return headline;
  }
}

/** 数字槽取值：优先用旁白里的数字，按出现顺序取。 */
function numericValue(slot: Slot, ctx: Ctx): string {
  const nums = ctx.content.numbers;
  const idx = ctx.numericIndex++;
  const fromNums = nums[idx];
  if (fromNums !== undefined) return String(fromNums);
  if (slot.k === "bignum") return ctx.content.bignum ?? nums[0]?.toString() ?? "";
  return nums[1]?.toString() ?? ctx.content.bignum ?? "";
}

function items(content: RenderContent, n: number): string[] {
  const src = content.bullets.filter(Boolean);
  if (src.length >= 1) return src.slice(0, n);
  return [content.headline];
}

function SlotNode({ slot, ctx, index }: { slot: Slot; ctx: Ctx; index: number }): JSX.Element {
  const [gx, gy, gw, gh] = slot.box;
  const cols = ctx.layout.cols ?? 12;
  const rows = ctx.layout.rows ?? 8;
  const x = (gx / cols) * 1280;
  const y = (gy / rows) * 720;
  const w = (gw / cols) * 1280;
  const h = (gh / rows) * 720;
  const tone = slot.tone ?? (slot.k === "bignum" ? "accent" : "ink");
  const C = colorsOf(ctx.layout.style);
  const fill = C[tone];
  const size = FONT_SIZE[slot.size ?? "m"];
  const anchor = textAnchor(slot.align);
  const tx = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x;
  const motion = slot.m ?? ctx.layout.enter[index % (ctx.layout.enter.length || 1)] ?? "m-fade-up";

  const g = (children: React.ReactNode) => (
    <g
      key={`${ctx.layout.id}-${index}`}
      data-anim=""
      data-slot={index}
      data-motion={motion}
      data-mx={slot.mx ?? ""}
      data-kind={slot.k}
    >
      {children}
    </g>
  );

  const opacity = slot.opacity ?? 1;

  switch (slot.k) {
    case "panel":
      return g(<rect x={x} y={y} width={w} height={h} fill={fill} opacity={opacity} />);
    case "vignette":
      return g(<rect x={x} y={y} width={w} height={h} fill="none" stroke={C.hairline} strokeWidth={1} />);
    case "frame":
      return g(<rect x={x} y={y} width={w} height={h} fill="none" stroke={fill} strokeWidth={2} />);
    case "rule":
      return g(<rect x={x} y={y + h / 2} width={w} height={Math.max(h, 2)} fill={fill} opacity={0.9} />);
    case "divider":
      return g(<rect x={x} y={y} width={Math.max(w, 2)} height={h} fill={fill} opacity={0.6} />);
    case "arrow":
      return g(
        <g>
          <rect x={x} y={y + h / 2 - 1.5} width={w * 0.72} height={3} fill={fill} />
          <polygon points={`${x + w * 0.68},${y + h / 2 - 8} ${x + w},${y + h / 2} ${x + w * 0.68},${y + h / 2 + 8}`} fill={fill} />
        </g>,
      );
    case "progress":
      return g(<rect x={x} y={y} width={w} height={h} fill={fill} opacity={0.85} />);
    case "chart": {
      const kind = slot.chart ?? "line-up";
      return g(<Chart kind={kind} w={w} h={h} seed={ctx.content.beat} tone={tone === "accent" ? "accent" : "ink"} values={ctx.content.numbers} />);
    }
    case "figure":
      return g(
        <g opacity={opacity}>
          <Figure kind={slot.figure ?? "fig-converge"} w={w} h={h} style={ctx.layout.style} />
        </g>,
      );
    case "asset": case "image": case "device": case "icon":
      return g(<Asset id={slot.asset ?? "icon-star"} w={w} h={h} tone={tone === "accent" ? "accent" : tone === "dim" ? "dim" : tone === "paper" ? "paper" : "ink"} />);
    case "dotmatrix": {
      const n = Math.max(3, Math.min(24, ctx.content.numbers[0] ?? 12));
      const r = Math.min(h / 2.6, 10);
      const gap = w / n;
      return g(
        <g>
          {Array.from({ length: n }, (_, i) => (
            <circle key={i} cx={x + gap * (i + 0.5)} cy={y + h / 2} r={r} fill={fill} opacity={i === n - 1 ? 1 : 0.35} />
          ))}
        </g>,
      );
    }
    case "bullets": case "listnum": case "checklist": {
      const list = items(ctx.content, slot.k === "bullets" ? 3 : 4);
      const lineH = Math.min(size * 2.1, h / list.length);
      return g(
        <g>
          {list.map((t, i) => (
            <Fragment key={i}>
              {slot.k === "listnum" && <text x={x} y={y + lineH * (i + 0.85)} fontSize={size * 0.7} fill={C.dim} fontFamily={SANS}>{`${i + 1}.`}</text>}
              {slot.k === "checklist" && <circle cx={x + 9} cy={y + lineH * (i + 0.72)} r={7} fill="none" stroke={C.accent} strokeWidth={2} />}
              <text
                x={slot.k === "bullets" ? x + 18 : x + (slot.k === "checklist" ? 26 : 34)}
                y={y + lineH * (i + 0.85)}
                fontSize={size}
                fill={fill}
                fontFamily={SANS}
                data-part=""
              >
                {slot.k === "bullets" ? `— ${t.slice(0, 22)}` : t.slice(0, 22)}
              </text>
            </Fragment>
          ))}
        </g>,
      );
    }
    case "tags": case "pills": {
      const list = items(ctx.content, 4);
      const cw = w / Math.max(list.length, 1);
      return g(
        <g>
          {list.map((t, i) => (
            <Fragment key={i}>
              <rect x={x + cw * i + 4} y={y} width={cw - 12} height={h} rx={h / 2} fill={slot.k === "pills" ? fill : "none"} stroke={fill} strokeWidth={2} opacity={0.95} />
              <text x={x + cw * (i + 0.5)} y={y + h * 0.68} fontSize={Math.min(size, h * 0.5)} fill={slot.k === "pills" && tone === "accent" ? C.paper : fill} fontFamily={SANS} textAnchor="middle" data-part="">
                {t.slice(0, 6)}
              </text>
            </Fragment>
          ))}
        </g>,
      );
    }
    case "bignum": case "num2": {
      const val = numericValue(slot, ctx);
      const text = slot.k === "num2" && !val ? ctx.content.bignum ?? "" : val;
      return g(
        <text x={tx} y={y + h * 0.82} fontSize={size} fill={fill} fontFamily={SERIF} fontWeight={700} textAnchor={anchor} data-numeric="">
          {text}
        </text>,
      );
    }
    case "delta": {
      const n = ctx.content.numbers.at(-1) ?? 0;
      return g(
        <text x={tx} y={y + h * 0.8} fontSize={size} fill={fill} fontFamily={SERIF} fontWeight={700} data-numeric="">
          {`+${n}%`}
        </text>,
      );
    }
    case "literal": case "badge": case "kicker": case "label": case "meta": {
      const t = slotText(slot, ctx.content);
      if (!t) return g(<g />);
      return g(
        <text x={tx} y={y + h * 0.72} fontSize={size} fill={fill} fontFamily={SANS} textAnchor={anchor} letterSpacing={slot.k === "kicker" || slot.k === "badge" ? 2 : 0}>
          {t}
        </text>,
      );
    }
    default: {
      // 文本类：headline / text / quote / caption / subhead / attribution / source / unit
      const raw = slotText(slot, ctx.content);
      const isHeadlineLike = slot.k === "headline" || slot.k === "text" || slot.k === "quote";
      const t = isHeadlineLike ? displayHeadline(raw) : raw;
      if (!t) return g(<g />);
      const lines = wrapText(t, size, w);
      const lineH = size * 1.32;
      const startY = y + Math.min(h * 0.5 + (lines.length - 1) * lineH * 0.5, h * 0.9) - (lines.length - 1) * lineH + size * 0.18;
      const family = slot.k === "source" || slot.k === "attribution" || slot.k === "caption" ? SANS : SERIF;
      const weight = isHeadlineLike ? 600 : 400;
      // 海报风大字拆成逐字符独立 <text>：这样逐字动效（上浮／打出）才有对象，
      // 每个字也都是可以单独做变换的图形。编辑风保持整行，不动既有视觉。
      const splitChars = isHeadlineLike && size >= 24 && ctx.layout.style === "poster";
      return g(
        <g>
          {lines.map((ln, i) => {
            const yLine = startY + i * lineH;
            if (!splitChars) {
              return (
                <text key={i} x={tx} y={yLine} fontSize={size} fill={fill} fontFamily={family} fontWeight={weight} textAnchor={anchor} data-line="">
                  {ln}
                </text>
              );
            }
            const chars = Array.from(ln);
            const widths = chars.map((ch) => charWidth(ch) * size);
            const total = widths.reduce((a, b) => a + b, 0);
            let cx = anchor === "middle" ? tx - total / 2 : anchor === "end" ? tx - total : tx;
            return (
              <g key={i} data-line="">
                {chars.map((ch, j) => {
                  const cw = widths[j]!;
                  const at = cx + cw / 2;
                  cx += cw;
                  return (
                    <text key={j} x={at} y={yLine} fontSize={size} fill={fill} fontFamily={family} fontWeight={weight} textAnchor="middle" data-char="">
                      {ch}
                    </text>
                  );
                })}
              </g>
            );
          })}
        </g>,
      );
    }
  }
}

export interface LayoutSVGProps {
  layout: Layout;
  content: RenderContent;
  paper?: string;
}

/** 版式图层：只有槽位，不带 <svg> 外壳与背景 —— 供播放器把多拍叠在同一张 SVG 里。 */
export function LayoutLayer({ layout, content }: { layout: Layout; content: RenderContent }): JSX.Element {
  const ctx: Ctx = { content, layout, numericIndex: 0 };
  return (
    <g data-layout={layout.id}>
      {layout.slots.map((slot, i) => (
        <SlotNode key={i} slot={slot} ctx={ctx} index={i} />
      ))}
    </g>
  );
}

/** 版式 → 完整纯 SVG（1280×720 坐标系），画廊与单帧导出用。 */
export function LayoutSVG({ layout, content, paper }: LayoutSVGProps): JSX.Element {
  const bg = paper ?? colorsOf(layout.style).paper;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1280 720"
      width={1280}
      height={720}
      data-layout={layout.id}
    >
      <rect x={0} y={0} width={1280} height={720} fill={bg} />
      <LayoutLayer layout={layout} content={content} />
      <BeatMark beat={content.beat} style={layout.style} />
    </svg>
  );
}

/** 拍号角标 */
export function BeatMark({ beat, style }: { beat: number; style?: Style }): JSX.Element {
  return (
    <text x={1280 * 0.08} y={720 - 24} fontSize={13} fill={colorsOf(style).dim} fontFamily={SANS} data-beat="">
      {`BEAT ${String(beat).padStart(2, "0")}`}
    </text>
  );
}

export { displayWidth };
