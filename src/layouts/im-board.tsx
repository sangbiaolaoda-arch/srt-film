// image 组满版插画板式 —— 「图像从哪来」的第二个答案：程序化生成（baseline-audit 缺陷 6）。
//
// 为什么是程序化 SVG，而不是外部图片素材：项目硬约束是「HTML 是画面权威来源、
// 预览与导出同源」（见 render/frame.ts 把可见层 SVG 序列化进 canvas）。<image> /
// foreignObject / 外链 url() 会污染 canvas，导出即黑帧或丢图。所以「图像」必须由
// 同一棵 SVG 长出 —— 图像层不是「贴一张图」，而是「画一幅与旁白语义同构的矢量画面」。
//
// 与 v2.tsx 的关系：**共用构图契约**（Board 签名、profile 换皮、data-anim 钩子、
// 1280×720 画布、无 Math.random），但主角从「文字 / 数据」换成「可辨识的物象」：
// 容器、连接、路径、生长、门、滤镜。每条板都回答「它在替旁白说什么」。
//
// 主体来源纪律：形状只由旁白**已有的语义信号**驱动（bignum 的量级、bullets 的条数、
// 对照的两极、过程的先后），不臆造具体名词画面 —— 旁白说「服务器」我们不画一台特定
// 品牌的机器，只画「请求往返」这件可抽象的事。

import { stripPunct } from "../core/text";
import { fit } from "./kaojin";
import { VText } from "./v2";
import type { Layout, RenderContent } from "./types";
import type { StyleProfile } from "../styles/style-system";

export interface BoardProps {
  content: RenderContent;
  beat: number;
  profile: StyleProfile;
}

type Board = (p: BoardProps) => JSX.Element;

/** 页脚去重：与 v2 同规则（子串即不渲染，留白比复读好）。 */
function foot(t: string | undefined, body: string): string {
  const c = t ? stripPunct(t) : "";
  return c && !body.includes(c) ? c : "";
}

/** 确定性伪随机：同输入同画面（导出逐帧 seek 必须可复现）。 */
function hash(i: number, j: number, k: number): number {
  const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 本拍可用要点（去标点、去空、封顶 4 条）。数量驱动主体的「个数」而非内容。 */
function pts(content: RenderContent, max = 4): string[] {
  return content.bullets
    .map((b) => stripPunct(b))
    .filter((b) => b.length > 0)
    .slice(0, max);
}

/* ── 01 管道回路（flow-circuit）────────────────────────────────────
   一条闭合回路：入口 → 处理节点 → 出口。节点数 = 要点数（最少 3）。
   替旁白说：这是一个有输入、有处理、有产出的过程 —— 不是一句静态结论。 */
const imFlowCircuit: Board = ({ content, profile: p }) => {
  const items = pts(content, 4);
  const n = Math.max(3, Math.min(4, items.length || 3));
  const cy = 360;
  const nodes = Array.from({ length: n }, (_, i) => ({
    x: 250 + (i * 780) / (n - 1),
    y: i % 2 === 0 ? cy - 90 : cy + 90,
  }));
  const path = nodes.map((q, i) => `${i === 0 ? "M" : "L"}${q.x} ${q.y}`).join(" ");
  const t = stripPunct(content.headline);
  const size = fit(t, 52);
  return (
    <g>
      {/* 回路主干：先画轨道再落节点，motion 让轨道先成形 */}
      <path d={path} fill="none" stroke={p.ink} strokeWidth={p.lineWidth} opacity={0.28}
        data-anim data-motion="m-stroke-draw" />
      {nodes.map((q, i) => (
        <g key={i} data-anim data-motion={i % 2 === 0 ? "m-scale-soft" : "m-fade-up"}>
          <circle cx={q.x} cy={q.y} r={34} fill={i === n - 1 ? p.accent : p.paper}
            stroke={i === n - 1 ? p.accent : p.ink} strokeWidth={p.lineWidth} />
          <circle cx={q.x} cy={q.y} r={9} fill={i === n - 1 ? p.paper : p.ink} opacity={0.9} />
        </g>
      ))}
      {/* 入口/出口标注：只标位置关系，不编内容 */}
      <VText x={nodes[0]!.x} y={nodes[0]!.y + 78} size={20} fill={p.ink} text="入" profile={p} opacity={0.5} />
      <VText x={nodes[n - 1]!.x} y={nodes[n - 1]!.y + 78} size={20} fill={p.accent} text="出" profile={p} opacity={0.7} />
      <VText x={640} y={640} size={size} fill={p.ink} text={t} profile={p} motion="m-char-rise" />
    </g>
  );
};

/* ── 02 分层堆栈（layer-stack）────────────────────────────────────
   等距分层色块：底层是基础，上层是建立在它之上的东西。层数 = 要点数（3~4）。
   替旁白说：这几件事不是并列的，是一层压一层的依赖。 */
const imLayerStack: Board = ({ content, profile: p }) => {
  const items = pts(content, 4);
  const n = Math.max(3, Math.min(4, items.length || 3));
  const shades = [p.clay, p.sand, p.aux, p.accent];
  const bw = 620;
  const bh = 92;
  const x0 = 330;
  const yTop = 190;
  const t = stripPunct(content.headline);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const top = n - 1 - i; // 视觉上最重要的在最上层、最靠后画
        const y = yTop + i * (bh + 14);
        const inset = i * 34;
        return (
          <g key={i} data-anim data-motion={i % 2 === 0 ? "m-slide-right" : "m-slide-left"}>
            <rect x={x0 + inset} y={y} width={bw - inset * 2} height={bh} rx={p.radius}
              fill={shades[top]} opacity={0.92} />
            <rect x={x0 + inset} y={y} width={bw - inset * 2} height={3} fill={p.paper} opacity={0.35} />
          </g>
        );
      })}
      <VText x={640} y={650} size={fit(t, 46)} fill={p.ink} text={t} profile={p} motion="m-fade-up" />
    </g>
  );
};

/* ── 03 两极对照（polarity）──────────────────────────────────────
   左右两个体量不等的形体，中间一根分隔线。体量比取自左右字数比（真对照，不是装饰）。
   替旁白说：这两件事被放在同一个尺度上比 —— 而且确实不一样大。 */
const imPolarity: Board = ({ content, profile: p }) => {
  const L = stripPunct(content.left || content.headline);
  const R = stripPunct(content.right || content.subhead || "");
  const lw = Array.from(L).length || 1;
  const rw = Array.from(R).length || 1;
  // 体量按字数比归一到 0.34..0.66，避免一边被压到看不见
  const ratio = Math.max(0.34, Math.min(0.66, lw / (lw + rw)));
  const maxR = 250;
  const rl = maxR * ratio * 1.6;
  const rr = maxR * (1 - ratio) * 1.6;
  const footT = foot(content.caption, L + R);
  return (
    <g>
      <circle cx={390} cy={330} r={rl} fill={p.accent} opacity={0.88} data-anim data-motion="m-scale-soft" />
      <circle cx={890} cy={330} r={rr} fill={p.steel} opacity={0.88} data-anim data-motion="m-scale-soft" />
      <line x1={640} y1={70} x2={640} y2={600} stroke={p.ink} strokeWidth={p.lineWidth} opacity={0.25}
        data-anim data-motion="m-rise-lines" />
      <VText x={390} y={620} size={fit(L, 34)} fill={p.ink} text={L} profile={p} motion="m-fade-up" />
      {R && <VText x={890} y={620} size={fit(R, 34)} fill={p.ink} text={R} profile={p} motion="m-fade-up" />}
      {footT && <VText x={640} y={678} size={20} fill={p.ink} text={footT} profile={p} opacity={0.45} />}
    </g>
  );
};

/* ── 04 生长阶梯（growth）────────────────────────────────────────
   逐级抬升的阶梯，级数 = 要点数。替旁白说：这是累积出来的，不是一次到位的。 */
const imGrowth: Board = ({ content, profile: p }) => {
  const items = pts(content, 4);
  const n = Math.max(3, Math.min(4, items.length || 3));
  const x0 = 230;
  const stepW = 180;
  const baseY = 560;
  const maxH = 300;
  const t = stripPunct(content.headline);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const h = (maxH * (i + 1)) / n;
        const fill = i === n - 1 ? p.accent : p.aux;
        return (
          <rect key={i} x={x0 + i * stepW} y={baseY - h} width={stepW - 16} height={h}
            rx={p.radius} fill={fill} opacity={0.9}
            data-anim data-motion="m-rise-lines" />
        );
      })}
      <line x1={x0 - 20} y1={baseY} x2={x0 + n * stepW} y2={baseY} stroke={p.ink}
        strokeWidth={p.lineWidth} opacity={0.3} data-anim data-motion="m-bar-sweep" />
      <VText x={640} y={648} size={fit(t, 44)} fill={p.ink} text={t} profile={p} motion="m-fade-up" />
    </g>
  );
};

/* ── 05 门缝（threshold）─────────────────────────────────────────
   一堵墙 + 一道透光的缝。替旁白说：这里有一个「还没过去 / 可以过去」的临界点。
   注意：这是唯一允许「画不存在的东西」的板 —— 但它画的是关系（内外 / 通不通），
   不是具体物件，且只有旁白出现转折/条件信号时才被挑中（见 pick.ts）。 */
const imThreshold: Board = ({ content, profile: p }) => {
  const t = stripPunct(content.headline);
  const footT = foot(content.caption, t);
  return (
    <g>
      <rect x={60} y={60} width={1160} height={600} rx={p.radius} fill={p.dark} opacity={0.94}
        data-anim data-motion="m-fade-up" />
      {/* 门缝：一道竖光 + 地面延伸的梯形光斑 */}
      <rect x={600} y={150} width={80} height={460} fill={p.cream} opacity={0.92}
        data-anim data-motion="m-wipe-left" />
      <polygon points="600,610 680,610 800,720 480,720" fill={p.cream} opacity={0.16}
        data-anim data-motion="m-fade-up" />
      <VText x={640} y={120} size={fit(t, 44)} fill={p.cream} text={t} profile={p} motion="m-char-rise" />
      {footT && (
        <VText x={640} y={700} size={22} fill={p.cream} text={footT} profile={p} opacity={0.6} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ── 06 颗粒场（field）───────────────────────────────────────────
   确定性颗粒散布 + 中央主体字。颗粒数由 bignum（有量级时）或要点数驱动。
   替旁白说：这是「大量、分散、但同向」的事 —— 氛围主体，不是空底排字。 */
const imField: Board = ({ content, profile: p }) => {
  const t = stripPunct(content.headline);
  const footT = foot(content.caption, t);
  // 颗粒密度：有数字就按量级（封顶），没有就按要点数 —— 都由旁白现算，不是常数
  const mag = content.numbers[0] ?? 0;
  const seedN = mag > 0 ? Math.min(120, Math.round(mag / 2) || 24) : (pts(content, 4).length || 3) * 18;
  const dots: JSX.Element[] = [];
  for (let i = 0; i < seedN; i++) {
    const cx = 40 + hash(i, 1, 3) * 1200;
    const cy = 40 + hash(i, 2, 5) * 640;
    const r = 1.5 + hash(i, 3, 7) * 3.2;
    if (cx > 560 && cx < 720 && cy > 300 && cy < 420) continue; // 给中央字留净空
    dots.push(
      <circle key={i} cx={cx} cy={cy} r={r}
        fill={hash(i, 4, 11) > 0.86 ? p.accent : p.ink}
        opacity={0.12 + hash(i, 5, 13) * 0.3} />,
    );
  }
  return (
    <g>
      <g data-anim data-motion="m-drift-slow">{dots}</g>
      <VText x={640} y={378} size={fit(t, 104)} fill={p.ink} text={t} profile={p} motion="m-char-rise" />
      {footT && (
        <VText x={640} y={640} size={24} fill={p.ink} text={footT} profile={p} opacity={0.5} spacing={4} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ══ 注册表 ═══════════════════════════════════════════════════════ */

export const IM_BOARDS: Record<string, Board> = {
  "im:flow-circuit": imFlowCircuit,
  "im:layer-stack": imLayerStack,
  "im:polarity": imPolarity,
  "im:growth": imGrowth,
  "im:threshold": imThreshold,
  "im:field": imField,
};

/* ══ 版式条目 ═══════════════════════════════════════════════════════
   与 v2.tsx 的 B() 同构造（custom 通路、decor/wash 关、机位缓推），
   但 group 一律 "image" —— 缺陷 6 要的就是「图像组终于有满版板式」。
   slots 只留一个 headline 资格槽：hookCover 等门禁靠它判断「这拍有没有文字主角」，
   真正的画面由 board 全权构图，槽位不参与渲染。 */
function IB(id: string, name: string, opts: Partial<Layout> = {}): Layout {
  return {
    id: `imb-${id}`,
    name: `满版·${name}`,
    group: "image",
    enter: ["m-fade-up", "m-slide-right"],
    custom: `im:${id}`,
    decor: false,
    wash: false,
    camera: { scaleFrom: 1.0, scaleTo: 1.08 },
    slots: [{ k: "headline", box: [1, 1, 10, 6] }],
    ...opts,
    style: opts.style ?? "editorial",
  };
}

export const IM_LAYOUTS: Layout[] = [
  IB("flow-circuit", "管道回路", { note: "过程 / 有输入有产出；节点数 = 要点数", enter: ["m-stroke-draw", "m-scale-soft"], bg: "dots-fade" }),
  IB("layer-stack", "分层堆栈", { note: "依赖关系：一层压一层；层数 = 要点数", enter: ["m-slide-right", "m-slide-left"] }),
  IB("polarity", "两极对照", { note: "left/right 真对照，体量按字数比", enter: ["m-scale-soft", "m-rise-lines"] }),
  IB("growth", "生长阶梯", { note: "累积 / 递进；级数 = 要点数", enter: ["m-rise-lines", "m-bar-sweep"] }),
  IB("threshold", "门缝", { note: "转折 / 临界：只画关系不画物件", enter: ["m-fade-up", "m-wipe-left"], paper: "#14131a" }),
  IB("field", "颗粒场", { note: "大量同向的事；密度由旁白数字或要点数现算", enter: ["m-drift-slow", "m-char-rise"], bg: "halftone" }),
];
