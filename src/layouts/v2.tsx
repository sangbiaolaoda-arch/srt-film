// v2 满版构图板式库 —— 「重做一套」的第一批。
//
// 与旧库（catalog 槽位排版器）的关系：**不共用构造方式**。旧库把文字塞进网格槽再补装饰；
// 这里每套板式是一幅完整的满版构图（色块出血 / 图形主角 / 大衬线字 / 大留白），
// 台词作为参数填进构图 —— 构图由板式决定，不由内容长度决定。
//
// Phase 5：板**只读风格 profile**（见 src/styles/style-system.ts），不写死任何颜色。
// 同一套构图在 editorial / flat-vector / chart-motion 三系下靠 profile 的色板与图形语法
// token 换皮，做到「同一段 SRT 在三种风格下对照」是真换风格不换构图逻辑。
// 动效契约：与专属场景一致 —— data-anim + data-motion 由 stage 通用调度驱动。
// 确定性：无 filter、无随机（尘埃用 hash 伪随机，同输入同画面）。

import { emphasize, SEM_SCALE, SEM_WEIGHT } from "./emphasis";
import { fit, lines } from "./kaojin";
import { stripPunct } from "../core/text";
import { displayWidth } from "../core/compose";
import type { Layout, RenderContent, Style } from "./types";
import type { StyleProfile } from "../styles/style-system";

export interface BoardProps {
  content: RenderContent;
  beat: number;
  profile: StyleProfile;
}

type Board = (p: BoardProps) => JSX.Element;

/* ── 横排整行 + 行内语义强调（转发 data-anim 动效钩子）。 */
function VText(props: {
  x: number; y: number; size: number; fill: string; text: string; profile: StyleProfile;
  anchor?: "start" | "middle" | "end"; spacing?: number; motion?: string; opacity?: number;
}) {
  const segs = emphasize(props.text);
  return (
    <text
      x={props.x} y={props.y} textAnchor={props.anchor ?? "middle"}
      fontSize={props.size} fill={props.fill} fontFamily={props.profile.fontDisplay}
      letterSpacing={props.spacing} opacity={props.opacity}
      data-anim={props.motion ? true : undefined} data-motion={props.motion}
    >
      {segs.map((s, i) =>
        s.tone ? (
          <tspan key={i} fill={props.profile.sem[s.tone]} fontSize={props.size * SEM_SCALE} fontWeight={SEM_WEIGHT}>
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
  rows: string[]; x: number; y0: number; size: number; fill: string; profile: StyleProfile; motion?: string;
}) {
  const lh = props.size * 1.42;
  return (
    <g data-anim={props.motion ? true : undefined} data-motion={props.motion}>
      {props.rows.map((r, i) => (
        <VText key={i} x={props.x} y={props.y0 + i * lh} size={props.size} fill={props.fill} text={r}
          profile={props.profile} anchor="start" />
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

/* ══ 编辑风 / 扁平矢量风 共用构图（编辑风纸白、扁平风明亮平涂 + 圆角）════════ */

/* ── 01 分屏色块对照 ───────────────────────────────────────────────
   左侧靛蓝色块满版出血占 2/3，right 压纸白；中缝一根朱红细线。 */
const v2SplitBlocks: Board = ({ content, profile: p }) => {
  const L = clean(content.left) || stripPunct(content.headline);
  const R = clean(content.right) || clean(content.subhead);
  const footT = foot(content.caption, L + R);
  return (
    <g>
      <rect x={-40} y={-40} width={880} height={800} rx={p.radius} fill={p.aux} data-anim data-motion="m-slide-right" />
      <rect x={840} y={-40} width={480} height={800} rx={p.radius} fill={p.paper} />
      <rect x={836} y={-40} width={5} height={800} fill={p.accent} />
      <VText x={80} y={390} size={fitW(L, 700, 84)} fill={p.paper} text={L} profile={p} anchor="start" motion="m-fade-up" />
      {R && <VText x={920} y={400} size={fitW(R, 300, 44)} fill={p.ink} text={R} profile={p} anchor="start" motion="m-fade-up" />}
      {footT && footT !== R && (
        <VText x={920} y={640} size={fitW(footT, 300, 22)} fill={p.ink} text={footT} profile={p} anchor="start" opacity={0.55} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ── 02 情绪一笔 ───────────────────────────────────────────────────
   大字上半部（末行朱红），底部一条手绘抖动墨线，注脚右下。 */
const v2InkLine: Board = ({ content, profile: p }) => {
  const t = stripPunct(content.headline);
  const rows = wrap(t, 2);
  const last = rows.length - 1;
  const footT = foot(content.caption, rows.join(""));
  return (
    <g>
      {rows.map((r, i) => (
        <VText key={i} x={110} y={250 + i * 150} size={fit(rows[0]!, 92)} fill={i === last ? p.accent : p.ink}
          text={r} profile={p} anchor="start" motion="m-char-rise" />
      ))}
      <path data-anim data-motion="m-stroke-draw"
        d="M96 596 C 260 584 430 610 640 594 S 1020 586 1184 600"
        stroke={p.ink} strokeWidth={p.lineWidth} fill="none" opacity={0.85} />
      {footT && (
        <VText x={1184} y={660} size={22} fill={p.ink} text={footT} profile={p} anchor="end" opacity={0.55} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ── 03 巨号数字 ───────────────────────────────────────────────────
   纸白底超大衬线数字居中，顶部细线小字条，单位右下。 */
const v2NumGiant: Board = ({ content, profile: p }) => {
  const n = clean(content.bignum) || (content.numbers[0] !== undefined ? String(content.numbers[0]) : "");
  const main = n || stripPunct(content.headline);
  const kick = foot(content.caption, main) || foot(content.subhead, main);
  const unit = clean(content.unit);
  const splittable = unit !== "" && main.endsWith(unit)
    && Array.from(main).length - Array.from(unit).length >= 1 && Array.from(unit).length <= 2;
  const shown = splittable ? main.slice(0, main.length - unit.length) : main;
  const size = Math.min(300, Math.floor(1000 / Math.max(1, Array.from(shown).length)));
  return (
    <g>
      <rect x={110} y={112} width={1060} height={2} fill={p.ink} opacity={0.7} data-anim data-motion="m-bar-sweep" />
      {kick && <VText x={110} y={88} size={24} fill={p.ink} text={kick} profile={p} anchor="start" spacing={6} opacity={0.75} motion="m-fade-up" />}
      <VText x={640} y={470} size={size} fill={p.ink} text={shown} profile={p} motion="m-scale-soft" />
      {splittable && (
        <VText x={640 + (Array.from(shown).length * size) / 2 + 40}
          y={470} size={44} fill={p.accent} text={unit} profile={p} anchor="start" motion="m-fade-up" />
      )}
      <circle cx={1170} cy={640} r={5} fill={p.accent} data-anim data-motion="m-tick-pulse" />
    </g>
  );
};

/* ── 03b 数字色带 ─────────────────────────────────────────────────
   数字板式二段：满版靛蓝横带 + 带上巨号数字（纸白），与 num-giant
   （纸白巨号）按拍交替 —— 数字拍两套构图轮换，避免同一画面复现。 */
const v2NumBand: Board = ({ content, profile: p }) => {
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
      {kick && <VText x={110} y={120} size={26} fill={p.ink} text={kick} profile={p} anchor="start" spacing={6} opacity={0.7} motion="m-fade-up" />}
      <rect x={-40} y={250} width={1360} height={230} rx={p.radius} fill={p.aux} data-anim data-motion="m-slide-right" />
      <VText x={640} y={midY} size={size} fill={p.paper} text={shown} profile={p} motion="m-scale-soft" />
      {splittable && <VText x={640 + (Array.from(shown).length * size) / 2 + 36} y={midY} size={40} fill={p.accent} text={unit} profile={p} anchor="start" motion="m-fade-up" />}
      {footT && <VText x={1170} y={620} size={22} fill={p.ink} text={footT} profile={p} anchor="end" opacity={0.55} motion="m-fade-up" />}
      <rect x={110} y={560} width={72} height={4} fill={p.accent} data-anim data-motion="m-bar-sweep" />
    </g>
  );
};

/* ── 04 引语卡 ─────────────────────────────────────────────────────
   左上朱红竖条 + 左对齐引文 + 底部出处细线。 */
const v2QuoteCard: Board = ({ content, profile: p }) => {
  const rows = wrap(stripPunct(content.headline), 3);
  const size = Math.min(68, fit(rows[0] ?? "", 880));
  const from = clean(content.subhead);
  return (
    <g>
      <rect x={120} y={200} width={7} height={150} fill={p.accent} data-anim data-motion="m-fade-up" />
      <VLines rows={rows} x={170} y0={300} size={size} fill={p.ink} profile={p} motion="m-char-rise" />
      {from && (
        <g data-anim data-motion="m-fade-up">
          <rect x={170} y={586} width={72} height={2} fill={p.ink} opacity={0.6} />
          <VText x={170} y={632} size={26} fill={p.ink} text={from} profile={p} anchor="start" opacity={0.65} />
        </g>
      )}
    </g>
  );
};

/* ── 05 清单刻度 ───────────────────────────────────────────────────
   左侧大标 + 右列条目（朱红小方块为记），条目间细线。 */
const v2ListMarks: Board = ({ content, profile: p }) => {
  const clauses = content.bullets.map(clean).filter(Boolean);
  const hi = clauses.reduce((best, c, i) => (displayWidth(c) > displayWidth(clauses[best]!) ? i : best), 0);
  const h = clauses.length > 0 ? clauses[hi]! : stripPunct(content.headline);
  const items = clauses.filter((_, i) => i !== hi).slice(0, 4);
  const step = items.length > 0 ? Math.min(96, 500 / items.length) : 96;
  return (
    <g>
      <VText x={110} y={320} size={fitW(h, 540, 88)} fill={p.ink} text={h} profile={p} anchor="start" motion="m-char-rise" />
      <rect x={112} y={366} width={64} height={5} fill={p.accent} />
      {items.map((it, i) => (
        <g key={i} data-anim data-motion="m-fade-up">
          <rect x={700} y={172 + i * step - 13} width={12} height={12} rx={p.radius} fill={p.accent} />
          <VText x={736} y={172 + i * step} size={30} fill={p.ink} text={it} profile={p} anchor="start" />
          {i < items.length - 1 && <rect x={700} y={172 + i * step + 22} width={470} height={1} fill={p.ink} opacity={0.18} />}
        </g>
      ))}
    </g>
  );
};

/* ── 06 竖排大字 ───────────────────────────────────────────────────
   右侧竖排超大字（最多 9 字，溢出转横排左下），左上一枚朱红记号方块。 */
const v2Vertical: Board = ({ content, profile: p }) => {
  const chars = Array.from(stripPunct(content.headline));
  const col = chars.slice(0, 9);
  const rest = chars.slice(9).join("");
  const size = Math.min(92, Math.floor(560 / col.length));
  const sub = rest || clean(content.subhead) || clean(content.caption);
  return (
    <g>
      <rect x={130} y={110} width={26} height={26} rx={p.radius} fill={p.accent} data-anim data-motion="m-scale-soft" />
      <g data-anim data-motion="m-fade-up">
        {col.map((ch, i) => (
          <text key={i} x={1020} y={170 + i * size * 1.16} fontSize={size} fill={p.ink} fontFamily={p.fontDisplay} textAnchor="middle">
            {ch}
          </text>
        ))}
      </g>
      <rect x={978} y={150} width={2} height={col.length * size * 1.16 - size * 0.5} fill={p.ink} opacity={0.25} />
      {sub && <VText x={130} y={620} size={30} fill={p.ink} text={sub} profile={p} anchor="start" opacity={0.7} motion="m-fade-up" />}
    </g>
  );
};

/* ── 07 章节卡 ─────────────────────────────────────────────────────
   顶部序号小字条 + 中央大字 + 朱红分隔短线 + 底部序号点。 */
const v2Chapter: Board = ({ content, profile: p }) => {
  const rows = wrap(stripPunct(content.headline), 2);
  return (
    <g>
      <VText x={640} y={150} size={26} fill={p.ink} text={String(content.beat).padStart(2, "0")} profile={p} spacing={8} opacity={0.6} motion="m-fade-up" />
      <rect x={560} y={186} width={160} height={1.5} fill={p.ink} opacity={0.4} />
      <VLines rows={rows} x={170} y0={400} size={fitW(rows[0] ?? "", 930, 112)} fill={p.ink} profile={p} motion="m-char-rise" />
      <rect x={590} y={rows.length > 1 ? 590 : 540} width={100} height={5} fill={p.accent} data-anim data-motion="m-bar-sweep" />
    </g>
  );
};

/* ── 08 单线生长 ───────────────────────────────────────────────────
   左下大字 + 阶梯折线向右上生长，末端朱红到点。 */
const v2Steps: Board = ({ content, profile: p }) => {
  const h = stripPunct(content.headline);
  return (
    <g>
      <path data-anim data-motion="m-stroke-draw"
        d="M120 520 L120 452 L420 452 L420 344 L760 344 L760 236 L1150 236"
        stroke={p.ink} strokeWidth={p.lineWidth} fill="none" />
      <circle cx={1150} cy={236} r={9} fill={p.accent} data-anim data-motion="m-tick-pulse" />
      <VText x={110} y={648} size={fit(h, 60)} fill={p.ink} text={h} profile={p} anchor="start" motion="m-fade-up" />
    </g>
  );
};

/* ══ 扁平矢量叙事风构图（明亮平涂 + 粗描边 + 圆角；编辑风走同一套亦成立）══════ */

/* ── 09 双圆对峙 ───────────────────────────────────────────────────
   非对称对角（参考 136 非对称跨页）：大红圆压左下、小青圆抬右上，错位制造张力。 */
const v2Duo: Board = ({ content, profile: p }) => {
  const L = clean(content.left) || stripPunct(content.headline);
  const R = clean(content.right);
  return (
    <g>
      <circle cx={350} cy={300} r={205} fill={p.ember} data-anim data-motion="m-slide-right" />
      <circle cx={952} cy={470} r={120} fill={p.steel} data-anim data-motion="m-slide-left" />
      <VText x={350} y={542} size={fit(L, 44)} fill={p.cream} text={L} profile={p} motion="m-fade-up" />
      {R && <VText x={952} y={624} size={fit(R, 32)} fill={p.cream} text={R} profile={p} opacity={0.85} motion="m-fade-up" />}
    </g>
  );
};

/* ── 10 暗底大字（扁平风改为明亮文字 + 暖光晕）────────────────────
   大字后一团暖光晕（多层半透明圆，不用 filter）+ 单行大字。 */
const v2DarkWord: Board = ({ content, profile: p }) => {
  const t = stripPunct(content.headline);
  const footT = foot(content.caption, t);
  return (
    <g>
      <g data-anim data-motion="m-glow">
        <circle cx={640} cy={340} r={300} fill={p.ember} opacity={0.05} />
        <circle cx={640} cy={340} r={210} fill={p.ember} opacity={0.07} />
        <circle cx={640} cy={340} r={130} fill={p.ember} opacity={0.1} />
      </g>
      <VText x={640} y={390} size={fit(t, 150)} fill={p.ink} text={t} profile={p} motion="m-char-rise" />
      {footT && (
        <VText x={640} y={640} size={26} fill={p.ink} text={footT} profile={p} opacity={0.5} spacing={4} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ── 11 水平色带 ───────────────────────────────────────────────────
   五条满版水平色带（粉/沙/赭/靛/墨），大字压赭带，配缓推机位。 */
const v2Strata: Board = ({ content, profile: p }) => {
  const bands: Array<[string, number]> = [
    [p.blush, 150], [p.sand, 140], [p.clay, 130], [p.aux, 160], [p.dark, 180],
  ];
  let y = -40;
  const rects = bands.map(([c, h], i) => {
    const r = <rect key={i} x={-40} y={y} width={1360} height={h + 40} rx={p.radius} fill={c} data-anim data-motion={i % 2 === 0 ? "m-slide-right" : "m-slide-left"} />;
    y += h;
    return r;
  });
  return (
    <g>
      {rects}
      <VText x={640} y={380} size={fit(stripPunct(content.headline), 88)} fill={p.cream}
        text={stripPunct(content.headline)} profile={p} motion="m-char-rise" />
    </g>
  );
};

/* ── 12 天平 ───────────────────────────────────────────────────────
   支点三角 + 微倾横梁 + 两只吊盘（红 / 青），left/right 压盘。 */
const v2Balance: Board = ({ content, profile: p }) => {
  const L = clean(content.left);
  const R = clean(content.right);
  const tilt = Array.from(L).length >= Array.from(R || "0").length ? 14 : -14;
  const beamY = 300;
  return (
    <g>
      <path d={`M640 ${beamY - 8} L600 560 L680 560 Z`} fill={p.cream} opacity={0.9} data-anim data-motion="m-fade-up" />
      <line x1={310} y1={beamY + tilt} x2={970} y2={beamY - tilt} stroke={p.cream} strokeWidth={p.lineWidth} data-anim data-motion="m-stroke-draw" />
      <line x1={310} y1={beamY + tilt} x2={310} y2={beamY + tilt + 110} stroke={p.cream} strokeWidth={2} opacity={0.6} />
      <line x1={970} y1={beamY - tilt} x2={970} y2={beamY - tilt + 110} stroke={p.cream} strokeWidth={2} opacity={0.6} />
      <rect x={230} y={beamY + tilt + 110} width={160} height={14} rx={p.radius} fill={p.ember} data-anim data-motion="m-slide-right" />
      <rect x={890} y={beamY - tilt + 110} width={160} height={14} rx={p.radius} fill={p.steel} data-anim data-motion="m-slide-left" />
      {L && <VText x={310} y={beamY + tilt + 190} size={fit(L, 34)} fill={p.cream} text={L} profile={p} motion="m-fade-up" />}
      {R && <VText x={970} y={beamY - tilt + 190} size={fit(R, 34)} fill={p.cream} text={R} profile={p} motion="m-fade-up" />}
    </g>
  );
};

/* ── 13 尘埃与主体（扁平风改为明亮底 + 暖尘）──────────────────────
   确定性尘埃点阵（hash 伪随机，同输入同画面）+ 中央大字。 */
const v2Dust: Board = ({ content, profile: p }) => {
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
          fill={h(i, j, 4) > 0.9 ? p.ember : p.ink}
          opacity={0.14 + h(i, j, 5) * 0.3} />,
      );
    }
  }
  return (
    <g>
      <g data-anim data-motion="m-drift-slow">{dots}</g>
      <VText x={640} y={380} size={fit(stripPunct(content.headline), 120)} fill={p.ink}
        text={stripPunct(content.headline)} profile={p} motion="m-char-rise" />
      {footT && (
        <VText x={640} y={620} size={26} fill={p.ink} text={footT} profile={p} opacity={0.5} spacing={4} motion="m-fade-up" />
      )}
    </g>
  );
};

/* ── 04b 满版数据条（chart 组，数据语料的图形主角）─────────────────
   2~4 条水平条顶到画布两边，条长 ∝ 数值，第一条朱红其余墨/靛。
   条右端显示数字原文（raw 含单位）—— 条与数是同一事物的两种度量，不重复；
   左端只放印刷序号，不放标签（旁白里没有项目名，硬造标签就是编内容）。 */
const v2Bars: Board = ({ content, profile: p }) => {
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
      {kick && <VText x={110} y={120} size={26} fill={p.ink} text={kick} profile={p} anchor="start" spacing={6} opacity={0.7} motion="m-fade-up" />}
      <rect x={-40} y={150} width={1360} height={2} fill={p.ink} opacity={0.5} data-anim data-motion="m-bar-sweep" />
      {nums.map((n, i) => {
        const w = Math.max(140, Math.round((n.value / max) * 720));
        const y = top + i * rowH;
        const fill = i === 0 ? p.accent : i === 1 ? p.aux : p.ink;
        return (
          <g key={i}>
            <VText x={110} y={y + barH - 8} size={22} fill={p.ink} text={String(i + 1).padStart(2, "0")} profile={p} anchor="start" opacity={0.45} motion="m-fade-up" />
            <rect x={170} y={y} width={w} height={barH} rx={p.radius} fill={fill} opacity={i >= 2 ? 0.5 : 1} data-anim data-motion="m-bar-sweep" />
            <VText x={170 + w + 24} y={y + barH - 6} size={48} fill={fill} text={n.raw} profile={p} anchor="start" motion="m-fade-up" />
          </g>
        );
      })}
      {footT && <VText x={1170} y={640} size={22} fill={p.ink} text={footT} profile={p} anchor="end" opacity={0.55} motion="m-fade-up" />}
      <circle cx={1170} cy={120} r={5} fill={p.accent} data-anim data-motion="m-tick-pulse" />
    </g>
  );
};

/* ── 04c 水平时间线（timeline 组，叙事语料的阶段语言）──────────────
   主线横贯中部，节点上下交替出标签；首节点朱红大圆 + 大字（起点即主角）。 */
const v2Timeline: Board = ({ content, profile: p }) => {
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
      {kick && <VText x={110} y={120} size={26} fill={p.ink} text={kick} profile={p} anchor="start" spacing={6} opacity={0.7} motion="m-fade-up" />}
      <path d={`M${x0 - 60} ${y} L${x1 + 60} ${y}`} stroke={p.ink} strokeWidth={p.lineWidth} fill="none" opacity={0.85} data-anim data-motion="m-stroke-draw" />
      {items.map((t, i) => {
        const x = x0 + i * step;
        const up = i % 2 === 0;
        const main = i === 0;
        const size = main ? 38 : Math.min(28, fitW(t, step - 30, 28));
        return (
          <g key={i} data-anim data-motion="m-fade-up">
            <circle cx={x} cy={y} r={main ? 16 : 10} fill={main ? p.accent : p.ink} />
            <VText x={i === 0 ? x0 - 60 : i === n - 1 ? x1 + 60 : x} y={up ? y - 56 : y + 90}
              size={size} fill={main ? p.accent : p.ink} text={t} profile={p}
              anchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} />
          </g>
        );
      })}
      {footT && <VText x={1170} y={640} size={22} fill={p.ink} text={footT} profile={p} anchor="end" opacity={0.55} motion="m-fade-up" />}
    </g>
  );
};

/* ══ 图表动态图形风构图（白底 + 测量网格 + 等宽数字 + 坐标轴语言）══════════
   三套板共用同一组图形语法 token：MeasGrid（母版测量网格）、VNum（等宽数字）、
   p.axis 门控的坐标轴与刻度。轴/刻度上的数字全部来自本拍真实数据
   （max 由 numberTokens 现算），不放装饰性假刻度 —— 图表风的可信度建立在
   「屏幕上每个数都溯源」上，与旁白门禁同一条纪律。 */

/** 图表风母版测量网格：与 decor.tsx 图表风分支同参数（40px 细 + 200px 粗）。
 *  v2 板走 custom 通路不过 DecorLayer（render.tsx 对 custom 跳过 decor 层），
 *  网格由板内自绘 —— 母版签名不因渲染通路不同而丢失。pattern id 带拍号：
 *  同屏多拍共存同一棵 DOM（画廊/对照样片），重复 id 会全局解析到第一层。 */
function MeasGrid({ beat, p }: { beat: number; p: StyleProfile }): JSX.Element | null {
  if (!p.grid) return null;
  return (
    <g opacity={0.55}>
      <defs>
        <pattern id={`v2-grid-${beat}`} width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M40 0 L0 0 L0 40" fill="none" stroke={p.tone.hairline} strokeWidth={1} />
        </pattern>
        <pattern id={`v2-grid5-${beat}`} width={200} height={200} patternUnits="userSpaceOnUse">
          <path d="M200 0 L0 0 L0 200" fill="none" stroke={p.tone.hairline} strokeWidth={1.6} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={1280} height={720} fill={`url(#v2-grid-${beat})`} />
      <rect x={0} y={0} width={1280} height={720} fill={`url(#v2-grid5-${beat})`} />
    </g>
  );
}

/** 等宽数字文本：图表风的数字签名（fontNum）。刻度、图号、柱值都走它。 */
function VNum(props: {
  x: number; y: number; size: number; fill: string; text: string; p: StyleProfile;
  anchor?: "start" | "middle" | "end"; opacity?: number; motion?: string;
}): JSX.Element {
  return (
    <text
      x={props.x} y={props.y} fontSize={props.size} fill={props.fill}
      fontFamily={props.p.fontNum} fontWeight={500} letterSpacing={1}
      textAnchor={props.anchor ?? "start"} opacity={props.opacity}
      data-anim={props.motion ? true : undefined} data-motion={props.motion}
    >
      {props.text}
    </text>
  );
}

/** 刻度标签格式：≥10 取整，<10 留一位小数 —— 真实值的可读形式，不四舍五入出假精度。 */
function tickLabel(v: number): string {
  if (v === 0) return "0";
  return v >= 10 ? String(Math.round(v)) : v.toFixed(1);
}

/* ── 14 数据巨号（number 组，图表风的数字主角）──────────────────────
   等宽巨号数字 + 数字正下方一条测量尺（端 ticks + 居中标注）。
   尺量的是数字本身的宽度 —— 技术制图的尺寸线语汇，不是假数据轴。 */
const v2DataGiant: Board = ({ content, beat, profile: p }) => {
  const n = clean(content.bignum) || (content.numbers[0] !== undefined ? String(content.numbers[0]) : "");
  const main = n || stripPunct(content.headline);
  const kick = foot(content.caption, main) || foot(content.subhead, main);
  const unit = clean(content.unit);
  const splittable = unit !== "" && main.endsWith(unit)
    && Array.from(main).length - Array.from(unit).length >= 1 && Array.from(unit).length <= 2;
  const shown = splittable ? main.slice(0, main.length - unit.length) : main;
  const isNum = n !== "";
  const size = Math.min(280, Math.floor(940 / Math.max(1, Array.from(shown).length)));
  const x0 = 120;
  const baseY = 470;
  // 等宽数字近似宽：JetBrains Mono  advance ≈ 0.6em；非等宽回退按 0.62 估，只用于定位。
  const numW = Array.from(shown).length * size * (p.monoNum ? 0.6 : 0.62);
  return (
    <g>
      <MeasGrid beat={beat} p={p} />
      {kick && <VNum x={x0} y={120} size={22} fill={p.ink} text={kick} p={p} opacity={0.7} motion="m-fade-up" />}
      <VNum x={1170} y={120} size={20} fill={p.ink} text={`NO.${String(beat).padStart(2, "0")}`} p={p} anchor="end" opacity={0.5} motion="m-fade-up" />
      {isNum ? (
        <VNum x={x0} y={baseY} size={size} fill={p.ink} text={shown} p={p} motion="m-scale-soft" />
      ) : (
        <VText x={x0} y={baseY} size={size} fill={p.ink} text={shown} profile={p} anchor="start" motion="m-scale-soft" />
      )}
      {splittable && (
        <VNum x={x0 + numW + 28} y={baseY} size={46} fill={p.accent} text={unit} p={p} motion="m-fade-up" />
      )}
      {/* 测量尺：数字宽度即测量对象，尺寸线语汇。单位已跟在数字旁时不再重复标注 */}
      <g data-anim data-motion="m-bar-sweep">
        <line x1={x0} y1={556} x2={x0 + numW} y2={556} stroke={p.accent} strokeWidth={2} />
        <line x1={x0} y1={544} x2={x0} y2={568} stroke={p.accent} strokeWidth={2} />
        <line x1={x0 + numW} y1={544} x2={x0 + numW} y2={568} stroke={p.accent} strokeWidth={2} />
      </g>
      {unit && !splittable && <VNum x={x0 + numW / 2} y={604} size={20} fill={p.ink} text={unit} p={p} anchor="middle" opacity={0.55} />}
      <circle cx={1170} cy={640} r={5} fill={p.accent} data-anim data-motion="m-tick-pulse" />
    </g>
  );
};

/* ── 15 坐标柱（chart 组，图表风的图形主角）────────────────────────
   竖柱 + 基线 + 左侧真实值刻度（max 由本拍度量值现算）。柱顶标 raw 原文，
   柱下只放印刷序号 —— 旁白里没有项目名，硬造标签就是编内容。 */
const v2AxisColumns: Board = ({ content, beat, profile: p }) => {
  const nums = (content.numberTokens ?? [])
    .filter((t) => t.kind === "measure" && Number.isFinite(t.value) && t.value > 0)
    .slice(0, 4);
  const joined = nums.map((t) => t.raw).join(" ");
  const kick = foot(content.caption, joined);
  const footT = foot(content.subhead, joined);
  const max = nums.reduce((m, t) => Math.max(m, t.value), 0);
  const baseY = 560;
  const plotH = 300;
  const x0 = 230;
  const x1 = 1140;
  const slot = (x1 - x0) / Math.max(1, nums.length);
  const barW = Math.min(120, slot * 0.52);
  return (
    <g>
      <MeasGrid beat={beat} p={p} />
      {kick && <VNum x={110} y={120} size={22} fill={p.ink} text={kick} p={p} opacity={0.7} motion="m-fade-up" />}
      <VNum x={1170} y={120} size={20} fill={p.ink} text={`N=${nums.length}`} p={p} anchor="end" opacity={0.5} />
      {nums.length === 0 ? (
        <VText x={170} y={400} size={Math.min(72, fit(stripPunct(content.headline), 900))}
          fill={p.ink} text={stripPunct(content.headline)} profile={p} anchor="start" motion="m-char-rise" />
      ) : (
        <>
          {/* y 轴刻度：0 / ¼ / ½ / ¾ / max 五档，标签是真实值 */}
          {p.axis && [0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={x0 - 14} y1={baseY - plotH * f} x2={x1} y2={baseY - plotH * f}
                stroke={p.tone.hairline} strokeWidth={1} opacity={f === 0 ? 1 : 0.55} />
              <VNum x={x0 - 24} y={baseY - plotH * f + 7} size={20} fill={p.ink}
                text={tickLabel(max * f)} p={p} anchor="end" opacity={0.6} />
            </g>
          ))}
          {/* 基线 */}
          <line x1={x0 - 14} y1={baseY} x2={x1} y2={baseY} stroke={p.ink} strokeWidth={2} data-anim data-motion="m-bar-sweep" />
          {nums.map((t, i) => {
            const h = Math.max(6, (t.value / max) * plotH);
            const cx = x0 + slot * i + slot / 2;
            const fill = i === 0 ? p.accent : p.ink;
            return (
              <g key={i}>
                <rect x={cx - barW / 2} y={baseY - h} width={barW} height={h} rx={p.radius}
                  fill={fill} opacity={i === 0 ? 1 : 0.72} data-anim data-motion="m-bar-sweep" />
                <VNum x={cx} y={baseY - h - 16} size={34} fill={fill} text={t.raw} p={p} anchor="middle" motion="m-fade-up" />
                <VNum x={cx} y={baseY + 32} size={18} fill={p.ink} text={String(i + 1).padStart(2, "0")} p={p} anchor="middle" opacity={0.5} />
              </g>
            );
          })}
        </>
      )}
      {footT && <VNum x={1170} y={640} size={20} fill={p.ink} text={footT} p={p} anchor="end" opacity={0.55} motion="m-fade-up" />}
    </g>
  );
};

/* ── 16 测量注记（timeline 组，图表风的文字板）─────────────────────
   四角定位标记 + 等宽图号（FIG.拍号，真实数据）+ 引线锚点 + 底部通长尺。
   文字拍也保留图表风的图形语法 —— 全列一致性不靠「偶尔有张图」。 */
const v2MeasureNote: Board = ({ content, beat, profile: p }) => {
  const t = stripPunct(content.headline);
  const rows = wrap(t, 3);
  const size = Math.min(64, fit(rows[0] ?? "", 900));
  const items = content.bullets.map(clean).filter(Boolean).slice(0, rows.length <= 2 ? 3 : 0);
  const itemsY = 330 + rows.length * size * 1.42 + 26;
  const cap = foot(content.caption, rows.join("") + items.join(""));
  return (
    <g>
      <MeasGrid beat={beat} p={p} />
      {/* 四角定位标记：印刷制版的 registration marks */}
      <g stroke={p.tone.hairline} strokeWidth={1.2} fill="none">
        {([[64, 64], [1216, 64], [64, 640], [1216, 640]] as Array<[number, number]>).map(([cx, cy], i) => (
          <g key={i}>
            <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} />
            <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} />
            <circle cx={cx} cy={cy} r={4} />
          </g>
        ))}
      </g>
      <VNum x={110} y={120} size={20} fill={p.ink} text={`FIG.${String(beat).padStart(2, "0")}`} p={p} opacity={0.6} motion="m-fade-up" />
      {/* 引线 + 锚点：从锚点引线到文字块 */}
      <g data-anim data-motion="m-stroke-draw">
        <line x1={110} y1={172} x2={152} y2={252} stroke={p.accent} strokeWidth={1.5} />
        <circle cx={110} cy={172} r={5} fill={p.accent} />
      </g>
      <VLines rows={rows} x={152} y0={330} size={size} fill={p.ink} profile={p} motion="m-char-rise" />
      {items.map((it, i) => (
        <g key={i} data-anim data-motion="m-fade-up">
          <rect x={154} y={itemsY + i * 44 - 12} width={8} height={8} fill={p.accent} />
          <VText x={178} y={itemsY + i * 44} size={26} fill={p.ink} text={it} profile={p} anchor="start" opacity={0.8} />
        </g>
      ))}
      {cap && <VNum x={1170} y={660} size={18} fill={p.ink} text={cap} p={p} anchor="end" opacity={0.5} />}
      {/* 底部通长尺：11 等分 ticks（ BeatMark 在 y≈696，尺压在 678 不撞） */}
      <g>
        <line x1={110} y1={678} x2={1170} y2={678} stroke={p.ink} strokeWidth={1} opacity={0.7} />
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={110 + i * 106} y1={i % 5 === 0 ? 672 : 676} x2={110 + i * 106} y2={684}
            stroke={p.ink} strokeWidth={1} opacity={0.6} />
        ))}
      </g>
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
  "v2:data-giant": v2DataGiant,
  "v2:axis-columns": v2AxisColumns,
  "v2:measure-note": v2MeasureNote,
};

/** 板式条目构造：slots 只是「需要什么内容」的资格声明（渲染走 custom 场景，槽位被绕过）。 */
function B(id: string, name: string, group: Layout["group"], opts: Partial<Layout> = {}): Layout {
  const style: Style = opts.style ?? "editorial";
  return {
    id: `v2-${id}`,
    name: `满版·${name}`,
    group,
    enter: ["m-fade-up", "m-slide-right"],
    custom: `v2:${id}`,
    decor: false,
    wash: false,
    // 全场默认机位缓推：导出路径现会按此缩放（frame.ts cameraScale），
    // 预览/导出同源。扁平矢量风构图张力更大，推得更多。
    camera: { scaleFrom: 1.0, scaleTo: 1.1 },
    slots: [{ k: "headline", box: [1, 1, 10, 6] }],
    ...opts,
    style,
  };
}

export const V2_LAYOUTS: Layout[] = [
  B("split-blocks", "分屏色块", "compare", { note: "left/right 对照，靛蓝色块 2/3 出血", enter: ["m-slide-right", "m-fade-up"], bg: "dots-fade" }),
  B("ink-line", "情绪一笔", "statement", { note: "大字 + 底部墨线", enter: ["m-char-rise", "m-stroke-draw"], bg: "contour" }),
  B("num-giant", "巨号数字", "number", { note: "需要 1 个可溯源数字", needs: 1, enter: ["m-scale-soft", "m-bar-sweep"], bg: "halftone" }),
  B("num-band", "数字色带", "number", { note: "需要 1 个可溯源数字", needs: 1, enter: ["m-slide-right", "m-scale-soft"], bg: "halftone" }),
  B("bars", "数据条", "chart", { note: "需要 ≥2 个可溯源数字", needs: 2, slots: [{ k: "chart", box: [1, 1, 10, 6], needs: 2 }], enter: ["m-bar-sweep", "m-fade-up"], bg: "halftone" }),
  B("timeline", "时间线", "timeline", { note: "bullets ≥3 或长句分段", enter: ["m-stroke-draw", "m-fade-up"], bg: "dots-fade" }),
  B("quote-card", "引语卡", "quote", { note: "金句 / 设问", enter: ["m-char-rise", "m-fade-up"], bg: "contour" }),
  B("list-marks", "清单刻度", "list", { note: "bullets ≥ 3", enter: ["m-fade-up"], bg: "dots-fade" }),
  B("vertical", "竖排大字", "statement", { note: "短句（≤9 字）最佳", enter: ["m-fade-up", "m-scale-soft"], bg: "halftone" }),
  B("chapter", "章节卡", "bookend", { note: "开场 / 定版", enter: ["m-char-rise", "m-bar-sweep"], bg: "dots-fade" }),
  B("steps", "单线生长", "process", { note: "过程 / 递进", enter: ["m-stroke-draw", "m-fade-up"], camera: { scaleFrom: 1.0, scaleTo: 1.1 }, bg: "dots-fade" }),
  B("duo", "双圆对峙", "poster-geo", { style: "flat-vector", note: "非对称对峙（参考 136 非对称跨页）", enter: ["m-slide-right", "m-slide-left"], camera: { scaleFrom: 1.0, scaleTo: 1.14 }, fx: "particles-vortex", fxAccent: "ember", fxStrength: 0.8 }),
  B("dark-word", "暗底大字", "poster-focus", { style: "flat-vector", note: "金句定场", enter: ["m-char-rise", "m-glow"], camera: { scaleFrom: 1.0, scaleTo: 1.14 }, fx: "glow", fxAccent: "ember", fxStrength: 1.0 }),
  B("strata", "水平色带", "poster-field", { style: "flat-vector", note: "氛围场 + 大字，配缓推", enter: ["m-slide-right", "m-scale-soft"], camera: { scaleFrom: 1.0, scaleTo: 1.14 }, fx: "particles-converge", fxAccent: "accent", fxStrength: 0.8 }),
  B("balance", "天平", "poster-geo", { style: "flat-vector", note: "权衡对照", enter: ["m-stroke-draw", "m-fade-up"], camera: { scaleFrom: 1.0, scaleTo: 1.14 } }),
  B("dust", "尘埃与主体", "poster-focus", { style: "flat-vector", note: "氛围定场，配缓推", enter: ["m-drift-slow", "m-char-rise"], camera: { scaleFrom: 1.0, scaleTo: 1.14 }, fx: "particles-vortex", fxAccent: "steel", fxStrength: 0.8 }),
  // 图表动态图形风三件套：母版网格 + 等宽数字 + 坐标轴语言。机位推得比另外两系轻
  // （motionPace 0.9）—— 测量画面经不起大幅度位移，尺会抖。
  // data-giant / axis-columns 都带 chart 资格槽（needs 按**度量值**数，见 pick.ts
  // eligible 注释）：span「十年」不是可画的量，光板 numbers.length 会把「十年」
  // 渲染成光秃秃的「10」—— 量纲崩坏。headline 槽并存：hookCover 门禁认文字槽，
  // 数字板的「主角」是数字不是文字，没文字槽会把短句拍误判为小主槽版式。
  B("data-giant", "数据巨号", "number", { style: "chart-motion", note: "图表风巨号数字：等宽数字 + 测量尺", needs: 1, slots: [{ k: "headline", box: [1, 1, 10, 6] }, { k: "chart", box: [1, 1, 10, 6], needs: 1 }], enter: ["m-scale-soft", "m-bar-sweep"], camera: { scaleFrom: 1.0, scaleTo: 1.06 } }),
  B("axis-columns", "坐标柱", "chart", { style: "chart-motion", note: "图表风柱图：基线 + 真实值刻度", needs: 2, slots: [{ k: "headline", box: [1, 1, 10, 6] }, { k: "chart", box: [1, 1, 10, 6], needs: 2 }], enter: ["m-bar-sweep", "m-fade-up"], camera: { scaleFrom: 1.0, scaleTo: 1.06 } }),
  B("measure-note", "测量注记", "timeline", { style: "chart-motion", note: "图表风文字板：定位标记 + 引线 + 等宽图号", enter: ["m-fade-up", "m-stroke-draw"], camera: { scaleFrom: 1.0, scaleTo: 1.06 } }),
];
