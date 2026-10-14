// v2 满版构图板式库 —— 「重做一套」的第一批。
//
// 与旧库（catalog 槽位排版器）的关系：**不共用构造方式**。旧库把文字塞进网格槽再补装饰；
// 这里每套板式是一幅完整的满版构图（色块出血 / 图形主角 / 大衬线字 / 大留白），
// 台词作为参数填进构图 —— 构图由板式决定，不由内容长度决定。这是 m-A~m-E
// 画法套装与 kaojin/wangji 专属场景共同验证过的构造规律，总结为五条：
//   1. 满版出血：色块与图形顶到画布边（允许负坐标出血），不缩在安全槽里
//   2. 单一图形主角：每幅画只有一个图形主体，其余是文字与留白
//   3. 大衬线字是画面主角之一：字号由画布定，不由盒子定
//   4. 克制三色板：纸 / 墨 / 朱红，外加一个靛蓝辅助色；海报风暗底 + 电光红
//   5. 小字注脚形成印刷层次：顶部小字条、底部注脚、序号点
//
// 通用性：与 kaojin（一拍一幅专属画）不同，每套板式接受**任意台词** ——
// 内容进构图，不决定构图。注册进 V2_LAYOUTS 后进入自动挑选池（v2 优先，
// 旧 catalog 降为回退），导演仍可用 layoutId/custom 点名。
//
// 动效契约：与专属场景一致 —— data-anim + data-motion 由 stage 通用调度驱动。
// 确定性：无 filter、无随机（尘埃用 hash 伪随机，同输入同画面）。

import { emphasize, SEM_COLORS, SEM_SCALE, SEM_WEIGHT } from "./emphasis";
import { S, fit, lines } from "./kaojin";
import { stripPunct } from "../core/text";
import { displayWidth } from "../core/compose";
import type { Layout, RenderContent, Style } from "./types";

export interface BoardProps {
  content: RenderContent;
  beat: number;
  style: Style;
}

type Board = (p: BoardProps) => JSX.Element;

/* ── 色板（m 组印相取色，跨板式恒定）────────────────────────────── */
const PAPER = "#f2ede4"; // 米白纸
const INK = "#1d1a16"; // 墨黑
const VERMILION = "#c8401f"; // 朱红
const INDIGO = "#33506b"; // 靛蓝
const DARK = "#161410"; // 海报风暗底
const CREAM = "#f3ede4"; // 暗底上的纸色字
const EMBER = "#ff4d2e"; // 海报风电光红
const STEEL = "#3e6e83"; // 暗底靛蓝（提亮一档）
const BLUSH = "#e8c9c2"; // 灰粉
const SAND = "#d9c8ae"; // 沙色
const CLAY = "#b0603c"; // 赭

/** 横排整行 + 行内语义强调（与 kaojin 同参，但转发 data-anim 动效钩子）。 */
function VText(props: {
  x: number; y: number; size: number; fill: string; text: string; style: Style;
  anchor?: "start" | "middle" | "end"; spacing?: number; motion?: string; opacity?: number;
}) {
  const segs = emphasize(props.text);
  return (
    <text
      x={props.x} y={props.y} textAnchor={props.anchor ?? "middle"}
      fontSize={props.size} fill={props.fill} fontFamily={S}
      letterSpacing={props.spacing} opacity={props.opacity}
      data-anim={props.motion ? true : undefined} data-motion={props.motion}
    >
      {segs.map((s, i) =>
        s.tone ? (
          <tspan key={i} fill={SEM_COLORS[props.style][s.tone]} fontSize={props.size * SEM_SCALE} fontWeight={SEM_WEIGHT}>
            {s.text}
          </tspan>
        ) : (
          <tspan key={i}>{s.text}</tspan>
        ),
      )}
    </text>
  );
}

/** 多行左对齐大字（引文 / 清单标用），返回行数。 */
function VLines(props: {
  rows: string[]; x: number; y0: number; size: number; fill: string; style: Style; motion?: string;
}) {
  const lh = props.size * 1.42;
  return (
    <g data-anim={props.motion ? true : undefined} data-motion={props.motion}>
      {props.rows.map((r, i) => (
        <VText key={i} x={props.x} y={props.y0 + i * lh} size={props.size} fill={props.fill} text={r}
          style={props.style} anchor="start" />
      ))}
    </g>
  );
}

/** 台词断行：≤2 行优先，行长则 3 行，构图稳定。 */
function wrap(t: string, maxRows: number): string[] {
  const n = Array.from(t).length;
  if (n === 0) return [];
  const rows = Math.min(maxRows, Math.ceil(n / Math.ceil(n / maxRows)));
  return lines(t, Math.ceil(n / rows)).slice(0, maxRows);
}

const clean = (t: string | undefined): string => (t ? stripPunct(t) : "");

/** 按**可用宽度**（px）与字号上限适配。fit() 假定 1040px 满宽，
 *  出血分屏 / 半幅清单里直接用它会把字溢出色块 —— 这里按版面实际可用宽算。 */
function fitW(t: string, avail: number, cap: number): number {
  return Math.min(cap, Math.floor(avail / Math.max(1, Array.from(t).length)));
}

/** 页脚小字去重：caption 取自旁白第二分句，几乎总是已显示正文的子串 ——
 *  满版画面里同一句话出现两遍是最显眼的丑（02 语料印相实测 4/16 帧中招）。
 *  是子串就整个不渲染，留白比复读好。 */
function foot(t: string | undefined, body: string): string {
  const c = clean(t);
  return c && !body.includes(c) ? c : "";
}

/* ══ 编辑风 8 套（纸白底）══════════════════════════════════════════ */

/* ── 01 分屏色块对照（m-A07）──────────────────────────────────────
   左侧靛蓝色块满版出血占 2/3，right 压纸白；中缝一根朱红细线。 */
const v2SplitBlocks: Board = ({ content, style }) => {
  const L = clean(content.left) || stripPunct(content.headline);
  const R = clean(content.right) || clean(content.subhead);
  const footT = foot(content.caption, L + R);
  return (
    <g>
      <rect x={-40} y={-40} width={880} height={800} fill={INDIGO} data-anim data-motion="m-slide-right" />
      <rect x={840} y={-40} width={480} height={800} fill={PAPER} />
      <rect x={836} y={-40} width={5} height={800} fill={VERMILION} />
      <VText x={80} y={390} size={fitW(L, 700, 84)} fill={PAPER} text={L} style={style} anchor="start" motion="m-fade-up" />
      {R && <VText x={920} y={400} size={fitW(R, 300, 44)} fill={INK} text={R} style={style} anchor="start" motion="m-fade-up" />}
      {footT && footT !== R && (
        <VText x={920} y={640} size={fitW(footT, 300, 22)} fill={INK} text={footT} style={style} anchor="start" opacity={0.55} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ── 02 情绪一笔（m-A10）──────────────────────────────────────────
   大字上半部（末行朱红），底部一条手绘抖动墨线，注脚右下。 */
const v2InkLine: Board = ({ content, style }) => {
  const t = stripPunct(content.headline);
  const rows = wrap(t, 2);
  const last = rows.length - 1;
  const footT = foot(content.caption, rows.join(""));
  return (
    <g>
      {rows.map((r, i) => (
        <VText key={i} x={110} y={250 + i * 150} size={fit(rows[0]!, 92)} fill={i === last ? VERMILION : INK}
          text={r} style={style} anchor="start" motion="m-char-rise" />
      ))}
      <path data-anim data-motion="m-stroke-draw"
        d="M96 596 C 260 584 430 610 640 594 S 1020 586 1184 600"
        stroke={INK} strokeWidth={3.5} fill="none" opacity={0.85} />
      {footT && (
        <VText x={1184} y={660} size={22} fill={INK} text={footT} style={style} anchor="end" opacity={0.55} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ── 03 巨号数字（m-A14 / m-E19）──────────────────────────────────
   米白底超大衬线数字居中，顶部细线小字条，单位右下。 */
const v2NumGiant: Board = ({ content, style }) => {
  const n = clean(content.bignum) || (content.numbers[0] !== undefined ? String(content.numbers[0]) : "");
  const main = n || stripPunct(content.headline);
  const kick = foot(content.caption, main) || foot(content.subhead, main);
  // 单位拆分只做「数字部 ≥1 字 且 单位 ≤2 字」的短量纲（两秒钟 → 两 + 秒钟）；
  // 「半个小时」拆开只剩一个「半」，宁可整体作大字不拆。
  const unit = clean(content.unit);
  const splittable = unit !== "" && main.endsWith(unit)
    && Array.from(main).length - Array.from(unit).length >= 1 && Array.from(unit).length <= 2;
  const shown = splittable ? main.slice(0, main.length - unit.length) : main;
  const size = Math.min(300, Math.floor(1000 / Math.max(1, Array.from(shown).length)));
  return (
    <g>
      <rect x={110} y={112} width={1060} height={2} fill={INK} opacity={0.7} data-anim data-motion="m-bar-sweep" />
      {kick && <VText x={110} y={88} size={24} fill={INK} text={kick} style={style} anchor="start" spacing={6} opacity={0.75} motion="m-fade-up" />}
      <VText x={640} y={470} size={size} fill={INK} text={shown} style={style} motion="m-scale-soft" />
      {splittable && (
        <VText x={640 + (Array.from(shown).length * size) / 2 + 40}
          y={470} size={44} fill={VERMILION} text={unit} style={style} anchor="start" motion="m-fade-up" />
      )}
      <circle cx={1170} cy={640} r={5} fill={VERMILION} data-anim data-motion="m-tick-pulse" />
    </g>
  );
};

/* ── 03b 数字色带（m-E05 × m-A14）────────────────────────────────
   数字板式二段：满版靛蓝横带 + 带上巨号数字（纸白），与 num-giant
   （纸白巨号）按拍交替 —— 数字拍两套构图轮换，避免同一画面复现。 */
const v2NumBand: Board = ({ content, style }) => {
  const n = clean(content.bignum) || (content.numbers[0] !== undefined ? String(content.numbers[0]) : "");
  const main = n || stripPunct(content.headline);
  const kick = foot(content.caption, main);
  const footT = foot(content.subhead, main);
  const unit = clean(content.unit);
  const splittable = unit !== "" && main.endsWith(unit)
    && Array.from(main).length - Array.from(unit).length >= 1 && Array.from(unit).length <= 2;
  const shown = splittable ? main.slice(0, main.length - unit.length) : main;
  const size = Math.min(280, Math.floor(760 / Math.max(1, Array.from(shown).length)));
  const midY = 365 + size * 0.36;
  return (
    <g>
      {kick && <VText x={110} y={120} size={26} fill={INK} text={kick} style={style} anchor="start" spacing={6} opacity={0.7} motion="m-fade-up" />}
      <rect x={-40} y={250} width={1360} height={230} fill={INDIGO} data-anim data-motion="m-slide-right" />
      <VText x={640} y={midY} size={size} fill={PAPER} text={shown} style={style} motion="m-scale-soft" />
      {splittable && <VText x={640 + (Array.from(shown).length * size) / 2 + 36} y={midY} size={40} fill={VERMILION} text={unit} style={style} anchor="start" motion="m-fade-up" />}
      {footT && <VText x={1170} y={620} size={22} fill={INK} text={footT} style={style} anchor="end" opacity={0.55} motion="m-fade-up" />}
      <rect x={110} y={560} width={72} height={4} fill={VERMILION} data-anim data-motion="m-bar-sweep" />
    </g>
  );
};

/* ── 04 引语卡（m-E16）────────────────────────────────────────────
   左上朱红竖条 + 左对齐引文 + 底部出处细线。 */
const v2QuoteCard: Board = ({ content, style }) => {
  const rows = wrap(stripPunct(content.headline), 3);
  const size = Math.min(68, fit(rows[0] ?? "", 880));
  // 出处只取 subhead：caption 是旁白第二分句、已被正文包住，拿来做出处会重复
  const from = clean(content.subhead);
  return (
    <g>
      <rect x={120} y={200} width={7} height={150} fill={VERMILION} data-anim data-motion="m-fade-up" />
      <VLines rows={rows} x={170} y0={300} size={size} fill={INK} style={style} motion="m-char-rise" />
      {from && (
        <g data-anim data-motion="m-fade-up">
          <rect x={170} y={586} width={72} height={2} fill={INK} opacity={0.6} />
          <VText x={170} y={632} size={26} fill={INK} text={from} style={style} anchor="start" opacity={0.65} />
        </g>
      )}
    </g>
  );
};

/* ── 05 清单刻度（m-E17）──────────────────────────────────────────
   左侧大标 + 右列条目（朱红小方块为记），条目间细线。
   防重复：hero 取最长分句（信息主力），右列只放其余分句 —— 整句与分句
   并排渲染会让同一句话在画面里出现两遍（02 语料印相最丑的一类帧）。 */
const v2ListMarks: Board = ({ content, style }) => {
  const clauses = content.bullets.map(clean).filter(Boolean);
  const hi = clauses.reduce((best, c, i) => (displayWidth(c) > displayWidth(clauses[best]!) ? i : best), 0);
  const h = clauses.length > 0 ? clauses[hi]! : stripPunct(content.headline);
  const items = clauses.filter((_, i) => i !== hi).slice(0, 4);
  const step = items.length > 0 ? Math.min(96, 500 / items.length) : 96;
  return (
    <g>
      <VText x={110} y={320} size={fitW(h, 540, 88)} fill={INK} text={h} style={style} anchor="start" motion="m-char-rise" />
      <rect x={112} y={366} width={64} height={5} fill={VERMILION} />
      {items.map((it, i) => (
        <g key={i} data-anim data-motion="m-fade-up">
          <rect x={700} y={172 + i * step - 13} width={12} height={12} fill={VERMILION} />
          <VText x={736} y={172 + i * step} size={30} fill={INK} text={it} style={style} anchor="start" />
          {i < items.length - 1 && <rect x={700} y={172 + i * step + 22} width={470} height={1} fill={INK} opacity={0.18} />}
        </g>
      ))}
    </g>
  );
};

/* ── 06 竖排大字（m-A01 / m-E13）──────────────────────────────────
   右侧竖排超大字（最多 9 字，溢出转横排左下），左上一枚朱红记号方块。 */
const v2Vertical: Board = ({ content, style }) => {
  const chars = Array.from(stripPunct(content.headline));
  const col = chars.slice(0, 9);
  const rest = chars.slice(9).join("");
  const size = Math.min(92, Math.floor(560 / col.length));
  const sub = rest || clean(content.subhead) || clean(content.caption);
  return (
    <g>
      <rect x={130} y={110} width={26} height={26} fill={VERMILION} data-anim data-motion="m-scale-soft" />
      <g data-anim data-motion="m-fade-up">
        {col.map((ch, i) => (
          <text key={i} x={1020} y={170 + i * size * 1.16} fontSize={size} fill={INK} fontFamily={S} textAnchor="middle">
            {ch}
          </text>
        ))}
      </g>
      <rect x={978} y={150} width={2} height={col.length * size * 1.16 - size * 0.5} fill={INK} opacity={0.25} />
      {sub && <VText x={130} y={620} size={30} fill={INK} text={sub} style={style} anchor="start" opacity={0.7} motion="m-fade-up" />}
    </g>
  );
};

/* ── 07 章节卡（m-E15 / m-A16）────────────────────────────────────
   顶部序号小字条 + 中央大字 + 朱红分隔短线 + 底部序号点。 */
const v2Chapter: Board = ({ content, style }) => {
  const rows = wrap(stripPunct(content.headline), 2);
  return (
    <g>
      <VText x={640} y={150} size={26} fill={INK} text={String(content.beat).padStart(2, "0")} style={style} spacing={8} opacity={0.6} motion="m-fade-up" />
      <rect x={560} y={186} width={160} height={1.5} fill={INK} opacity={0.4} />
      <VLines rows={rows} x={170} y0={400} size={fitW(rows[0] ?? "", 930, 112)} fill={INK} style={style} motion="m-char-rise" />
      <rect x={590} y={rows.length > 1 ? 590 : 540} width={100} height={5} fill={VERMILION} data-anim data-motion="m-bar-sweep" />
    </g>
  );
};

/* ── 08 单线生长（m-E07 / m-E12）──────────────────────────────────
   左下大字 + 阶梯折线向右上生长，末端朱红到点。 */
const v2Steps: Board = ({ content, style }) => {
  const h = stripPunct(content.headline);
  return (
    <g>
      <path data-anim data-motion="m-stroke-draw"
        d="M120 520 L120 452 L420 452 L420 344 L760 344 L760 236 L1150 236"
        stroke={INK} strokeWidth={3} fill="none" />
      <circle cx={1150} cy={236} r={9} fill={VERMILION} data-anim data-motion="m-tick-pulse" />
      <VText x={110} y={648} size={fit(h, 60)} fill={INK} text={h} style={style} anchor="start" motion="m-fade-up" />
    </g>
  );
};

/* ══ 海报风 5 套（暗底）════════════════════════════════════════════ */

/* ── 09 双圆对峙（m-E03）──────────────────────────────────────────
   暗底上红与青两圆对角布置，left/right 各压一圆下方。 */
const v2Duo: Board = ({ content, style }) => {
  const L = clean(content.left) || stripPunct(content.headline);
  const R = clean(content.right);
  return (
    <g>
      <circle cx={392} cy={248} r={166} fill={EMBER} data-anim data-motion="m-slide-right" />
      <circle cx={888} cy={430} r={166} fill={STEEL} data-anim data-motion="m-slide-left" />
      <VText x={392} y={540} size={fit(L, 44)} fill={CREAM} text={L} style={style} motion="m-fade-up" />
      {R && <VText x={888} y={678} size={fit(R, 34)} fill={CREAM} text={R} style={style} opacity={0.85} motion="m-fade-up" />}
    </g>
  );
};

/* ── 10 暗底大字（m-E09）──────────────────────────────────────────
   暗底 + 字后一团暖光晕（多层半透明圆，不用 filter）+ 单行大字。 */
const v2DarkWord: Board = ({ content, style }) => {
  const t = stripPunct(content.headline);
  const footT = foot(content.caption, t);
  return (
    <g>
      <g data-anim data-motion="m-glow">
        <circle cx={640} cy={340} r={300} fill={EMBER} opacity={0.05} />
        <circle cx={640} cy={340} r={210} fill={EMBER} opacity={0.07} />
        <circle cx={640} cy={340} r={130} fill={EMBER} opacity={0.1} />
      </g>
      <VText x={640} y={390} size={fit(t, 150)} fill={CREAM} text={t} style={style} motion="m-char-rise" />
      {footT && (
        <VText x={640} y={640} size={26} fill={CREAM} text={footT} style={style} opacity={0.5} spacing={4} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ── 11 水平色带（m-E05）──────────────────────────────────────────
   五条满版水平色带（粉/沙/赭/靛/墨），大字压赭带，配缓推机位。 */
const v2Strata: Board = ({ content, style }) => {
  const bands: Array<[string, number]> = [
    [BLUSH, 150], [SAND, 140], [CLAY, 130], [INDIGO, 160], [DARK, 180],
  ];
  let y = -40;
  const rects = bands.map(([c, h], i) => {
    const r = <rect key={i} x={-40} y={y} width={1360} height={h + 40} fill={c} data-anim data-motion={i % 2 === 0 ? "m-slide-right" : "m-slide-left"} />;
    y += h;
    return r;
  });
  return (
    <g>
      {rects}
      <VText x={640} y={380} size={fit(stripPunct(content.headline), 88)} fill={CREAM}
        text={stripPunct(content.headline)} style={style} motion="m-char-rise" />
    </g>
  );
};

/* ── 12 天平（m-E18）──────────────────────────────────────────────
   暗底天平：支点三角 + 微倾横梁 + 两只吊盘（红 / 青），left/right 压盘。 */
const v2Balance: Board = ({ content, style }) => {
  const L = clean(content.left);
  const R = clean(content.right);
  // 文本长的一侧垂得更低（重的下沉）—— 反过来会像翘翘板失灵
  const tilt = Array.from(L).length >= Array.from(R || "0").length ? 14 : -14;
  const beamY = 300;
  return (
    <g>
      <path d={`M640 ${beamY - 8} L600 560 L680 560 Z`} fill={CREAM} opacity={0.9} data-anim data-motion="m-fade-up" />
      <line x1={310} y1={beamY + tilt} x2={970} y2={beamY - tilt} stroke={CREAM} strokeWidth={4} data-anim data-motion="m-stroke-draw" />
      <line x1={310} y1={beamY + tilt} x2={310} y2={beamY + tilt + 110} stroke={CREAM} strokeWidth={2} opacity={0.6} />
      <line x1={970} y1={beamY - tilt} x2={970} y2={beamY - tilt + 110} stroke={CREAM} strokeWidth={2} opacity={0.6} />
      <rect x={230} y={beamY + tilt + 110} width={160} height={14} fill={EMBER} data-anim data-motion="m-slide-right" />
      <rect x={890} y={beamY - tilt + 110} width={160} height={14} fill={STEEL} data-anim data-motion="m-slide-left" />
      {L && <VText x={310} y={beamY + tilt + 190} size={fit(L, 34)} fill={CREAM} text={L} style={style} motion="m-fade-up" />}
      {R && <VText x={970} y={beamY - tilt + 190} size={fit(R, 34)} fill={CREAM} text={R} style={style} motion="m-fade-up" />}
    </g>
  );
};

/* ── 13 尘埃与主体（m-E19 / m-B09）────────────────────────────────
   暗底 + 确定性尘埃点阵（hash 伪随机，同输入同画面）+ 中央大字。 */
const v2Dust: Board = ({ content, style }) => {
  const t = stripPunct(content.headline);
  const footT = foot(content.caption, t);
  const h = (i: number, j: number, k: number): number => {
    const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const dots: JSX.Element[] = [];
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 9; j++) {
      if (h(i, j, 0) > 0.62) continue;
      dots.push(
        <circle key={`${i}-${j}`}
          cx={40 + h(i, j, 1) * 1200} cy={40 + h(i, j, 2) * 640}
          r={1 + h(i, j, 3) * 2.4}
          fill={h(i, j, 4) > 0.9 ? EMBER : CREAM}
          opacity={0.14 + h(i, j, 5) * 0.3} />,
      );
    }
  }
  return (
    <g>
      <g data-anim data-motion="m-drift-slow">{dots}</g>
      <VText x={640} y={380} size={fit(stripPunct(content.headline), 120)} fill={CREAM}
        text={stripPunct(content.headline)} style={style} motion="m-char-rise" />
      {footT && (
        <VText x={640} y={620} size={26} fill={CREAM} text={footT} style={style} opacity={0.5} spacing={4} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ── 04b 满版数据条（chart 组，数据语料的图形主角）─────────────────
   2~4 条水平条顶到画布两边，条长 ∝ 数值，第一条朱红其余墨/靛。
   条右端显示数字原文（raw 含单位）—— 条与数是同一事物的两种度量，不重复；
   左端只放印刷序号，不放标签（旁白里没有项目名，硬造标签就是编内容）。 */
const v2Bars: Board = ({ content, style }) => {
  // 只收度量值：span（十年/四十秒）跟百分比画同一张对比条是量纲崩坏
  const nums = (content.numberTokens ?? []).filter((n) => n.kind === "measure" && Number.isFinite(n.value) && n.value > 0).slice(0, 4);
  const joined = nums.map((n) => n.raw).join(" ");
  const kick = foot(content.caption, joined);
  const footT = foot(content.subhead, joined);
  const max = nums.reduce((m, n) => Math.max(m, n.value), 0);
  const top = 220;
  const rowH = 88;
  const barH = 46;
  return (
    <g>
      {kick && <VText x={110} y={120} size={26} fill={INK} text={kick} style={style} anchor="start" spacing={6} opacity={0.7} motion="m-fade-up" />}
      <rect x={-40} y={150} width={1360} height={2} fill={INK} opacity={0.5} data-anim data-motion="m-bar-sweep" />
      {nums.map((n, i) => {
        const w = Math.max(140, Math.round((n.value / max) * 720));
        const y = top + i * rowH;
        const fill = i === 0 ? VERMILION : i === 1 ? INDIGO : INK;
        return (
          <g key={i}>
            <VText x={110} y={y + barH - 8} size={22} fill={INK} text={String(i + 1).padStart(2, "0")} style={style} anchor="start" opacity={0.45} motion="m-fade-up" />
            <rect x={170} y={y} width={w} height={barH} fill={fill} opacity={i >= 2 ? 0.5 : 1} data-anim data-motion="m-bar-sweep" />
            <VText x={170 + w + 24} y={y + barH - 6} size={48} fill={fill} text={n.raw} style={style} anchor="start" motion="m-fade-up" />
          </g>
        );
      })}
      {footT && <VText x={1170} y={640} size={22} fill={INK} text={footT} style={style} anchor="end" opacity={0.55} motion="m-fade-up" />}
      <circle cx={1170} cy={120} r={5} fill={VERMILION} data-anim data-motion="m-tick-pulse" />
    </g>
  );
};

/* ── 04c 水平时间线（timeline 组，叙事语料的阶段语言）──────────────
   主线横贯中部，节点上下交替出标签；首节点朱红大圆 + 大字（起点即主角）。 */
const v2Timeline: Board = ({ content, style }) => {
  const items = content.bullets.length >= 3
    ? content.bullets.map(clean).filter(Boolean).slice(0, 5)
    : wrap(stripPunct(content.headline), 4);
  const joined = items.join("");
  const kick = foot(content.caption, joined);
  const footT = foot(content.subhead, joined);
  const n = items.length;
  const y = 400;
  const x0 = 150;
  const x1 = 1130;
  const step = n > 1 ? (x1 - x0) / (n - 1) : 0;
  return (
    <g>
      {kick && <VText x={110} y={120} size={26} fill={INK} text={kick} style={style} anchor="start" spacing={6} opacity={0.7} motion="m-fade-up" />}
      <path d={`M${x0 - 60} ${y} L${x1 + 60} ${y}`} stroke={INK} strokeWidth={3} fill="none" opacity={0.85} data-anim data-motion="m-stroke-draw" />
      {items.map((t, i) => {
        const x = x0 + i * step;
        const up = i % 2 === 0;
        const main = i === 0;
        const size = main ? 38 : Math.min(28, fitW(t, step - 30, 28));
        return (
          <g key={i} data-anim data-motion="m-fade-up">
            <circle cx={x} cy={y} r={main ? 16 : 10} fill={main ? VERMILION : INK} />
            <VText x={i === 0 ? x0 - 60 : i === n - 1 ? x1 + 60 : x} y={up ? y - 56 : y + 90}
              size={size} fill={main ? VERMILION : INK} text={t} style={style}
              anchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} />
          </g>
        );
      })}
      {footT && <VText x={1170} y={640} size={22} fill={INK} text={footT} style={style} anchor="end" opacity={0.55} motion="m-fade-up" />}
    </g>
  );
};

/* ══ 注册表 ═══════════════════════════════════════════════════════ */

export const V2_BOARDS: Record<string, Board> = {
  "v2:split-blocks": v2SplitBlocks,
  "v2:ink-line": v2InkLine,
  "v2:num-giant": v2NumGiant,
  "v2:num-band": v2NumBand,
  "v2:bars": v2Bars,
  "v2:timeline": v2Timeline,
  "v2:quote-card": v2QuoteCard,
  "v2:list-marks": v2ListMarks,
  "v2:vertical": v2Vertical,
  "v2:chapter": v2Chapter,
  "v2:steps": v2Steps,
  "v2:duo": v2Duo,
  "v2:dark-word": v2DarkWord,
  "v2:strata": v2Strata,
  "v2:balance": v2Balance,
  "v2:dust": v2Dust,
};

/** 板式条目构造：slots 只是「需要什么内容」的资格声明（渲染走 custom 场景，槽位被绕过）。 */
function B(id: string, name: string, group: Layout["group"], opts: Partial<Layout> = {}): Layout {
  return {
    id: `v2-${id}`,
    name: `满版·${name}`,
    group,
    enter: ["m-fade-up", "m-slide-right"],
    custom: `v2:${id}`,
    decor: false,
    wash: false,
    slots: [{ k: "headline", box: [1, 1, 10, 6] }],
    ...opts,
  };
}

export const V2_LAYOUTS: Layout[] = [
  B("split-blocks", "分屏色块", "compare", { note: "left/right 对照，靛蓝色块 2/3 出血", enter: ["m-slide-right", "m-fade-up"] }),
  B("ink-line", "情绪一笔", "statement", { note: "大字 + 底部墨线", enter: ["m-char-rise", "m-stroke-draw"] }),
  B("num-giant", "巨号数字", "number", { note: "需要 1 个可溯源数字", needs: 1, enter: ["m-scale-soft", "m-bar-sweep"] }),
  B("num-band", "数字色带", "number", { note: "需要 1 个可溯源数字", needs: 1, enter: ["m-slide-right", "m-scale-soft"] }),
  B("bars", "数据条", "chart", { note: "需要 ≥2 个可溯源数字", needs: 2, slots: [{ k: "chart", box: [1, 1, 10, 6], needs: 2 }], enter: ["m-bar-sweep", "m-fade-up"] }),
  B("timeline", "时间线", "timeline", { note: "bullets ≥3 或长句分段", enter: ["m-stroke-draw", "m-fade-up"] }),
  B("quote-card", "引语卡", "quote", { note: "金句 / 设问", enter: ["m-char-rise", "m-fade-up"] }),
  B("list-marks", "清单刻度", "list", { note: "bullets ≥ 3", enter: ["m-fade-up"] }),
  B("vertical", "竖排大字", "statement", { note: "短句（≤9 字）最佳", enter: ["m-fade-up", "m-scale-soft"] }),
  B("chapter", "章节卡", "bookend", { note: "开场 / 定版", enter: ["m-char-rise", "m-bar-sweep"] }),
  B("steps", "单线生长", "process", { note: "过程 / 递进", enter: ["m-stroke-draw", "m-fade-up"], camera: { scaleFrom: 1.0, scaleTo: 1.05 } }),
  B("duo", "双圆对峙", "poster-geo", { style: "poster", note: "left/right 对照，暗底", enter: ["m-slide-right", "m-slide-left"], fx: "particles-vortex", fxAccent: EMBER, fxStrength: 0.5 }),
  B("dark-word", "暗底大字", "poster-focus", { style: "poster", note: "金句定场", enter: ["m-char-rise", "m-glow"], fx: "glow", fxAccent: EMBER, fxStrength: 0.95 }),
  B("strata", "水平色带", "poster-field", { style: "poster", note: "氛围场 + 大字，配缓推", enter: ["m-slide-right", "m-scale-soft"], camera: { scaleFrom: 1.0, scaleTo: 1.08 }, fx: "particles-converge", fxAccent: VERMILION, fxStrength: 0.55 }),
  B("balance", "天平", "poster-geo", { style: "poster", note: "权衡对照", enter: ["m-stroke-draw", "m-fade-up"] }),
  B("dust", "尘埃与主体", "poster-focus", { style: "poster", note: "氛围定场，配缓推", enter: ["m-drift-slow", "m-char-rise"], camera: { scaleFrom: 1.0, scaleTo: 1.08 }, fx: "particles-vortex", fxAccent: STEEL, fxStrength: 0.5 }),
];
