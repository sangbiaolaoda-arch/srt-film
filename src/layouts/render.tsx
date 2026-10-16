// 版式渲染器：把「版式数据 + 内容」渲染成纯 SVG。
// 同一份输出同时服务播放（DOM 里被 GSAP 驱动）与导出（序列化后画进 canvas）。
// 严禁 foreignObject / <image> / 外链 —— 否则 canvas 会被污染。

import { Fragment } from "react";
import { Chart } from "./charts";
import { Asset } from "./assets";
import { Figure } from "./figures";
import { KAOJIN_SCENES } from "./kaojin";
import { WANGJI_SCENES } from "./wangji";
import { V2_BOARDS } from "./v2";
import { IM_BOARDS } from "./im-board";
import { emphasize, SEM_COLORS, SEM_SCALE, SEM_WEIGHT, type Seg, type SemTone } from "./emphasis";
import { BgLayer } from "./bg";
import { DecorLayer } from "./decor";
import { WashLayer } from "./wash";
import { photoCutouts } from "./cutout";
import type { Layout, RenderContent, Slot, SlotKind, Style, Tone } from "./types";
import { displayHeadline, displayWidth } from "../core/compose";
import { stripPunct, charWidth, wrapText, FONT_SIZE } from "../core/text";
import { resolveProfile } from "../styles/style-system";

/** 风格档色板：直接取 style-system 的 tone token，不写死颜色。 */
export function colorsOf(style?: Style): Record<Tone, string> {
  return resolveProfile(style).tone;
}

function textAnchor(align: Slot["align"]): "start" | "middle" | "end" {
  return align === "center" ? "middle" : align === "end" ? "end" : "start";
}

/** 带语义标记的字符。headline 类文字先经 emphasize() 拆片段，再逐字带上 tone 参与换行。 */
interface MChar {
  ch: string;
  tone?: SemTone;
}

/** 带标记的换行：强调段按放大后的字宽计（否则放大后溢出槽位），孤字平衡与 wrapText 同策略。 */
function wrapMarked(chars: MChar[], sizePx: number, maxWidth: number): MChar[][] {
  const maxUnits = maxWidth / sizePx;
  const wOf = (c: MChar) => charWidth(c.ch) * (c.tone ? SEM_SCALE : 1);

  const greedy: MChar[][] = [];
  let line: MChar[] = [];
  let used = 0;
  for (const c of chars) {
    const cw = wOf(c);
    if (used + cw > maxUnits && line.length) {
      greedy.push(line);
      line = [c];
      used = cw;
    } else {
      line.push(c);
      used += cw;
    }
  }
  if (line.length) greedy.push(line);

  const lastLen = greedy[greedy.length - 1]?.length ?? 0;
  if (greedy.length < 2 || lastLen > 2) return greedy;

  const n = greedy.length;
  const balanced: MChar[][] = [];
  let at = 0;
  for (let ln = 0; ln < n; ln++) {
    const want = Math.max(1, Math.round((chars.length - at) / (n - ln)));
    let u = 0;
    let k = 0;
    while (k < want && at + k < chars.length && u + wOf(chars[at + k]!) <= maxUnits + 1e-9) {
      u += wOf(chars[at + k]!);
      k++;
    }
    if (k === 0) return greedy;
    balanced.push(chars.slice(at, at + k));
    at += k;
  }
  if (at < chars.length) return greedy;
  return balanced;
}

/** 行内相邻同色调片段合并成一个 <tspan>，减少节点数。 */
function mergeTones(row: MChar[]): Seg[] {
  const out: Seg[] = [];
  for (const c of row) {
    const last = out[out.length - 1];
    if (last && last.tone === c.tone) last.text += c.ch;
    else out.push({ text: c.ch, tone: c.tone });
  }
  return out;
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
    case "attribution": return caption ?? "旁白";
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

function items(content: RenderContent, n: number, skipFirst = 0): string[] {
  const src = content.bullets.filter(Boolean);
  if (src.length >= 1) return src.slice(skipFirst, skipFirst + n);
  // 全部跳过且无内容 → 别画空的（headline 兜底只在没跳过时给）
  return skipFirst > 0 ? [] : [content.headline];
}

/** 一组文案里最长的那条有多宽（以 em 计，全角 1 / 半角 0.5）。 */
function maxUnits(list: string[]): number {
  let m = 0;
  for (const t of list) {
    let u = 0;
    for (const ch of t) u += charWidth(ch);
    if (u > m) m = u;
  }
  return m;
}

/** 列表字号：缩到最长的一条在可用宽度内放得下，绝不切字。
 *  地板 10px —— 触底仍放不下时由 constraints.textFit 报硬错误（大声失败替代静默丢失）。 */
function fitListSize(list: string[], size: number, avail: number, kind: SlotKind): number {
  const inset = kind === "bullets" ? 18 : kind === "checklist" ? 26 : 34;
  const units = Math.max(1, maxUnits(list));
  return Math.max(10, Math.min(size, ((avail - inset) / units) * 0.96));
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
  const prof = resolveProfile(ctx.layout.style);
  const fill = C[tone];
  const size: number = FONT_SIZE[slot.size ?? "m"];
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
      // color 直指定：块面分割构图（画法 A07）需要深蓝/橙红等色板外颜色
      return g(<rect x={x} y={y} width={w} height={h} fill={slot.color ?? fill} opacity={opacity} />);
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
      return g(<Chart kind={kind} w={w} h={h} seed={ctx.content.beat} tone={tone === "accent" ? "accent" : "ink"} values={ctx.content.numbers} profile={prof} />);
    }
    case "figure":
      return g(
        <g opacity={opacity}>
          <Figure kind={slot.figure ?? "fig-converge"} w={w} h={h} x={x} y={y} style={ctx.layout.style} />
        </g>,
      );
    case "asset": case "image": case "device": case "icon":
      return g(<Asset id={slot.asset ?? "icon-star"} w={w} h={h} tone={tone === "accent" ? "accent" : tone === "dim" ? "dim" : tone === "paper" ? "paper" : "ink"} />);
    case "photo":
      // 真照片由 renderFrame 的 canvas 图像层直画 —— SVG-as-image 不能加载外部
      // 资源（浏览器硬规则），照片进不了序列化管线。这里只留空占位组：
      // 槽序号必须和 enter 池对上，后面的槽才不会拿错入场动效。
      return g(null);
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
      const list = items(ctx.content, slot.k === "bullets" ? 3 : 4, slot.skipFirst ?? 0).map(stripPunct);
      if (list.length === 0) return g(<g />);
      const lineH = Math.min(size * 2.1, h / list.length);
      // 单条不静默截断（与 headline 同哲学：排不下就缩字号，触底才交给门禁喊）。
      // 旧实现 `t.slice(0, 22)` 在 06 语料第 7 条实测触发：23 字的
      // 「写了整整十一个月的相对论论文」被切掉末字，无音轨成片里那句话直接少一字。
      const fs = fitListSize(list, size, w, slot.k);
      return g(
        <g>
          {list.map((t, i) => (
            <Fragment key={i}>
              {slot.k === "listnum" && <text x={x} y={y + lineH * (i + 0.85)} fontSize={fs * 0.7} fill={C.dim} fontFamily={prof.fontText}>{`${i + 1}.`}</text>}
              {slot.k === "checklist" && <circle cx={x + 9} cy={y + lineH * (i + 0.72)} r={7} fill="none" stroke={C.accent} strokeWidth={2} />}
              {/* 项目符号用图形画，不用「—」字符 —— 画面文字零标点（见 core/text.ts） */}
              {slot.k === "bullets" && <rect x={x + 3} y={y + lineH * (i + 0.72) - 4} width={8} height={8} fill={fill} />}
              <text
                x={slot.k === "bullets" ? x + 18 : x + (slot.k === "checklist" ? 26 : 34)}
                y={y + lineH * (i + 0.85)}
                fontSize={fs}
                fill={fill}
                fontFamily={prof.fontText}
                data-part=""
              >
                {t}
              </text>
            </Fragment>
          ))}
        </g>,
      );
    }
    case "tags": case "pills": {
      const list = items(ctx.content, 4, slot.skipFirst ?? 0).map(stripPunct);
      const cw = w / Math.max(list.length, 1);
      // 标签同理：缩到格宽放得下，不切字（+12% 内边距对齐原 rect 的 x+4 / w-12）。
      const ts = Math.min(size, h * 0.5, Math.max(10, ((cw - 14) / Math.max(1, maxUnits(list))) * 0.96));
      return g(
        <g>
          {list.map((t, i) => (
            <Fragment key={i}>
              <rect x={x + cw * i + 4} y={y} width={cw - 12} height={h} rx={h / 2} fill={slot.k === "pills" ? fill : "none"} stroke={fill} strokeWidth={2} opacity={0.95} />
              <text x={x + cw * (i + 0.5)} y={y + h * 0.68} fontSize={ts} fill={slot.k === "pills" && tone === "accent" ? C.paper : fill} fontFamily={prof.fontText} textAnchor="middle" data-part="">
                {t}
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
        <text x={tx} y={y + h * 0.82} fontSize={size} fill={fill} fontFamily={prof.fontNum} fontWeight={700} textAnchor={anchor} data-numeric="">
          {text}
        </text>,
      );
    }
    case "delta": {
      const n = ctx.content.numbers.at(-1) ?? 0;
      return g(
        <text x={tx} y={y + h * 0.8} fontSize={size} fill={fill} fontFamily={prof.fontNum} fontWeight={700} data-numeric="">
          {`+${n}%`}
        </text>,
      );
    }
    case "literal": case "badge": case "kicker": case "label": case "meta": {
      const t = stripPunct(slotText(slot, ctx.content));
      if (!t) return g(<g />);
      return g(
        <text x={tx} y={y + h * 0.72} fontSize={size} fill={fill} fontFamily={prof.fontText} textAnchor={anchor} letterSpacing={slot.k === "kicker" || slot.k === "badge" ? 2 : 0}>
          {t}
        </text>,
      );
    }
    default: {
      // 文本类：headline / text / quote / caption / subhead / attribution / source / unit
      const raw = slotText(slot, ctx.content);
      const isHeadlineLike = slot.k === "headline" || slot.k === "text" || slot.k === "quote";
      // 先按标点截断（displayHeadline），再净化标点 —— 顺序反了会让截断失效。
      const t = isHeadlineLike ? stripPunct(displayHeadline(raw)) : stripPunct(raw);
      if (!t) return g(<g />);

      // 竖排分支（画法 E01）：逐字从槽顶向下排。中文竖排大字构图。
      // 高度钳制与横排同哲学：排不下就缩字号重排，直到放得下或触底 ——
      // 旧实现直接 slice(0, maxChars)，超长台词被静默丢字：09 语料拍 11
      // 「手写的笔记留在桌上」9 字只画出「手写的笔记留」，观众看到半句话
      // 还以为话没说完。字号小可以救，丢字是画面在说错话，救不回来。
      if (slot.vertical) {
        const charsAll = Array.from(t);
        const fsFloorV = Math.max(24, size * 0.5);
        let sizeV = size;
        while (sizeV > fsFloorV && charsAll.length * sizeV * 1.16 > h) {
          sizeV = Math.max(fsFloorV, sizeV * 0.9);
        }
        const step = sizeV * 1.16;
        const maxChars = Math.max(2, Math.floor(h / step));
        // 触底仍放不下才丢 —— 且 textFit 的竖排检查会把它拦成硬错误（见 constraints.ts），
        // 大声失败替代静默丢失。
        const chars = charsAll.slice(0, maxChars);
        const anchorV = textAnchor(slot.align);
        const txV = anchorV === "middle" ? x + w / 2 : anchorV === "end" ? x + w : x + sizeV / 2 + 2;
        const startYV = y + sizeV * 0.92;
        return g(
          <g data-line="">
            {chars.map((ch, j) => (
              <text key={j} x={txV} y={startYV + j * step} fontSize={sizeV} fill={fill} fontFamily={prof.fontDisplay} fontWeight={600} textAnchor={anchorV === "middle" ? "middle" : "start"} data-char="">
                {ch}
              </text>
            ))}
          </g>,
        );
      }

      const family = slot.k === "source" || slot.k === "attribution" || slot.k === "caption" ? prof.fontText : prof.fontDisplay;
      // 短句放大（海报法则：hook 必须是画面最大的元素 —— 字越少，字就该越大）。
      // 「说」单独成拍时若只有 48px，画面必然空；放到贴满槽宽才是海报语言。
      // 出处：Adobe《How to design a poster》Step 3（本轮 Agent-Reach 实抓）+
      // 手册 02《构图与取景》层级断言。上限 340px 防止单字大到出格。
      let fs = size;
      if (isHeadlineLike) {
        const units = Array.from(t).reduce((n, ch) => n + (ch.codePointAt(0)! > 0xff ? 1 : 0.55), 0);
        if (units > 0 && units <= 8) {
          const byWidth = (w / units) * 0.86; // 保证单行放得下（不换行）
          const byHeight = h / 1.45; // 单行行高 1.32 + 余量
          fs = Math.max(size, Math.min(byWidth, byHeight, 340));
        }
      }
      const weight = isHeadlineLike ? 600 : 400;
      // 标题类先做语义强调：把「疼 / 代价 / 在乎」这类强词切出来，行内换色放大加粗。
      // 非标题小字（出处、注释）保持单一色调 —— 满屏都强调等于没有强调。
      const wrapAt = (f: number): MChar[][] =>
        isHeadlineLike
          ? wrapMarked(
              emphasize(t).flatMap((s) => Array.from(s.text).map((ch) => ({ ch, tone: s.tone }))),
              f,
              w,
            )
          : wrapText(t, f, w).map((ln) => Array.from(ln).map((ch) => ({ ch })));
      // 高度钳制（Phase 6 约束引擎的渲染侧落地）：排完超出槽高就缩字号重排，直到
      // 放得下或触底（基准字号的一半、且不低于 24px）。短句放大只按 ≤8 字钳过高度，
      // 9–16 字的长句 + mega 字号会把末行排出槽外 —— 画面上直接缺字，而 startY 的
      // 钳制让预览看起来只「差一点」。constraints.ts 的 textFit 量的就是这道线。
      const fsFloor = Math.max(24, size * 0.5);
      let rows = wrapAt(fs);
      while (fs > fsFloor && rows.length * fs * 1.32 > h) {
        fs = Math.max(fsFloor, fs * 0.9);
        rows = wrapAt(fs);
      }
      const lineH = fs * 1.32;
      const startY = y + Math.min(h * 0.5 + (rows.length - 1) * lineH * 0.5, h * 0.9) - (rows.length - 1) * lineH + fs * 0.18;
      const sem = SEM_COLORS[ctx.layout.style ?? "editorial"];
      // 海报风大字拆成逐字符独立 <text>：这样逐字动效（上浮／打出）才有对象，
      // 每个字也都是可以单独做变换的图形。编辑风保持整行，不动既有视觉。
      const splitChars = isHeadlineLike && fs >= 24 && ctx.layout.style === "flat-vector";
      return g(
        <g>
          {rows.map((row, i) => {
            const yLine = startY + i * lineH;
            if (!splitChars) {
              return (
                <text key={i} x={tx} y={yLine} fontSize={fs} fill={fill} fontFamily={family} fontWeight={weight} textAnchor={anchor} letterSpacing={slot.tracking} data-line="">
                  {mergeTones(row).map((s, j) =>
                    s.tone ? (
                      <tspan key={j} fill={sem[s.tone]} fontWeight={SEM_WEIGHT} fontSize={fs * SEM_SCALE}>
                        {s.text}
                      </tspan>
                    ) : (
                      <tspan key={j}>{s.text}</tspan>
                    ),
                  )}
                </text>
              );
            }
            const widths = row.map((c) => charWidth(c.ch) * fs * (c.tone ? SEM_SCALE : 1));
            const total = widths.reduce((a, b) => a + b, 0);
            let cx = anchor === "middle" ? tx - total / 2 : anchor === "end" ? tx - total : tx;
            return (
              <g key={i} data-line="">
                {row.map((c, j) => {
                  const cw = widths[j]!;
                  const at = cx + cw / 2;
                  cx += cw;
                  return (
                    <text
                      key={j}
                      x={at}
                      y={yLine}
                      fontSize={c.tone ? fs * SEM_SCALE : fs}
                      fill={c.tone ? sem[c.tone] : fill}
                      fontFamily={family}
                      fontWeight={c.tone ? SEM_WEIGHT : weight}
                      textAnchor="middle"
                      data-char=""
                      data-tone={c.tone ?? ""}
                    >
                      {c.ch}
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
  // 专属场景（kaojin.tsx / wangji.tsx）：整拍由手绘画面渲染，槽位机制被绕过。
  const scene = layout.custom ? (KAOJIN_SCENES[layout.custom] ?? WANGJI_SCENES[layout.custom]) : undefined;
  if (scene) {
    return (
      <g data-layout={layout.id}>
        {scene({ text: stripPunct(content.headline), beat: content.beat, style: layout.style ?? "editorial" })}
      </g>
    );
  }
  // v2 满版构图板式：同走 custom 通路，但收全量 content（board 是参数化构图，不是一拍一画）。
  const board = layout.custom ? (V2_BOARDS[layout.custom] ?? IM_BOARDS[layout.custom]) : undefined;
  if (board) {
    const C = colorsOf(layout.style);
    return (
      <g data-layout={layout.id}>
        {layout.bg && (
          <BgLayer kind={layout.bg} seed={content.beat} colorDim={C.dim} colorHairline={C.hairline} accent={C.accent} />
        )}
        {board({ content: { ...content, headline: stripPunct(content.headline) }, beat: content.beat, profile: resolveProfile(layout.style) })}
      </g>
    );
  }
  const ctx: Ctx = { content, layout, numericIndex: 0 };
  const C = colorsOf(layout.style);
  const cutouts = photoCutouts(layout);
  return (
    <g data-layout={layout.id}>
      {layout.wash !== false && (
        <WashLayer beat={content.beat} style={layout.style} paper={layout.paper} cutouts={cutouts} />
      )}
      {layout.bg && (
        <BgLayer kind={layout.bg} seed={content.beat} colorDim={C.dim} colorHairline={C.hairline} accent={C.accent} cutouts={cutouts} />
      )}
      {layout.slots.map((slot, i) => (
        <SlotNode key={i} slot={slot} ctx={ctx} index={i} />
      ))}
    </g>
  );
}

/** 版式 → 完整纯 SVG（1280×720 坐标系），画廊与单帧导出用。 */
export function LayoutSVG({ layout, content, paper }: LayoutSVGProps): JSX.Element {
  const bg = paper ?? layout.paper ?? colorsOf(layout.style).paper;
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
      {layout.decor !== false && !layout.custom && (
        <DecorLayer beat={content.beat} style={layout.style} />
      )}
      {layout.decor !== false && <BeatMark beat={content.beat} style={layout.style} />}
    </svg>
  );
}

/** 拍号角标 */
export function BeatMark({ beat, style }: { beat: number; style?: Style }): JSX.Element {
  const prof = resolveProfile(style);
  return (
    <text x={1280 * 0.08} y={720 - 24} fontSize={13} fill={colorsOf(style).dim} fontFamily={prof.fontText} data-beat="">
      {`BEAT ${String(beat).padStart(2, "0")}`}
    </text>
  );
}

export { displayWidth };
