// 《靠近还是远离》专属场景集 —— 23 拍完全重做。
//
// 与版式库（catalog + slots）的关系：**不复用**。每拍一幅手绘满版画面，
// 场景与台词一一对应，只被导演覆写 JSON 点名（layout.custom），不进自动挑选池。
//
// 视觉语言（对比旧库的「纯底 + 线框示意图 + 文字」）：
//   1. 满版色场：每拍一个专属 surface 底色（情绪明度定正负 —— docs/语义色彩映射.md §二）
//   2. 超大衬线字与图形咬合，字是画面主角之一
//   3. 语义色全部取自 src/layouts/emphasis.ts 的 SEM_ROLES（danger/cost/safe/warm），
//      行内强调复用 emphasize() —— 不在本文件重写色值
//   4. 光晕一律用多层半透明圆 / 径向渐变，不用 SVG filter（导出序列化兼容最稳）
//
// 动效契约：关键元素标 data-anim + data-motion，由 stage 的通用调度驱动
// （querySelectorAll("[data-anim]")，DOM 顺序即入场顺序，0.08s 级联）。

import { emphasize, SEM_COLORS, SEM_SCALE, SEM_WEIGHT, type SemTone } from "./emphasis";
import type { Style } from "./types";

export const S = '"Source Han Serif SC","Noto Serif SC","Songti SC",SimSun,serif';

export interface SceneProps {
  /** 本拍完整台词（来自旁白，诚实约束：场景不得引入台词之外的字） */
  text: string;
  /** 拍序号 */
  beat: number;
  /** 视觉风格 —— 决定语义色取值（editorial 朱红 / flat-vector 橙蓝 / chart-motion 橙蓝） */
  style: Style;
}

type Scene = (p: SceneProps) => JSX.Element;

/** 单行台词按最大可用宽（1040px）适配字号。 */
export function fit(t: string, max: number): number {
  return Math.min(max, Math.floor(1040 / Math.max(1, Array.from(t).length)));
}

/** 每 n 字一行（中文台词的确定性断行）。 */
export function lines(t: string, n: number): string[] {
  const chars = Array.from(t);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += n) out.push(chars.slice(i, i + n).join(""));
  return out;
}

/** 按关键词切成 [前, 词, 后]，场景据此安排主次字。 */
function splitAround(t: string, kw: string): [string, string, string] {
  const i = t.indexOf(kw);
  return i < 0 ? [t, "", ""] : [t.slice(0, i), kw, t.slice(i + kw.length)];
}

/** 横排整行 + 行内语义强调（<tspan> 换色放大加粗，与版式库同参）。 */
function Emph(props: {
  x: number; y: number; size: number; fill: string; text: string;
  style: Style; anchor?: "start" | "middle" | "end"; spacing?: number;
}) {
  const segs = emphasize(props.text);
  return (
    <text
      x={props.x} y={props.y} textAnchor={props.anchor ?? "middle"}
      fontSize={props.size} fill={props.fill} fontFamily={S}
      letterSpacing={props.spacing}
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

/** 拆成带语义色的单字（竖排用）。 */
function segChars(t: string): Array<{ ch: string; tone?: SemTone }> {
  const out: Array<{ ch: string; tone?: SemTone }> = [];
  for (const seg of emphasize(t)) for (const ch of Array.from(seg.text)) out.push({ ch, tone: seg.tone });
  return out;
}

/** 语义色快捷取值。 */
const sem = (style: Style, tone: SemTone): string => SEM_COLORS[style][tone];

/* ── 01 如果靠近一个人 ───────────────────────────────────────────────
   记住：黑暗中央一团暖光，一圈圈引力环向它收拢。 */
const kj01: Scene = ({ text, style }) => (
  <g>
    <g data-anim data-motion="m-zoom-in">
      {[400, 316, 238, 168].map((r, i) => (
        <circle key={r} cx={640} cy={296} r={r} fill="none" stroke="#ffb37a" strokeOpacity={0.34 - i * 0.08} strokeWidth={1.6} />
      ))}
    </g>
    <g data-anim data-motion="m-zoom-in">
      <circle cx={640} cy={296} r={132} fill="#ffb37a" opacity={0.16} />
      <circle cx={640} cy={296} r={94} fill="#ffb37a" />
      <circle cx={640} cy={296} r={40} fill="#ffe3c4" />
    </g>
    <Emph data-anim data-motion="m-fade-up" x={640} y={616} size={fit(text, 92)} fill="#f3ede4" text={text} style={style} />
  </g>
);

/* ── 02 那你还要不要靠近 ─────────────────────────────────────────────
   记住：红与黑两团的对峙，字压在对角线上。 */
const kj02: Scene = ({ text, style }) => (
  <g>
    <circle data-anim data-motion="m-slide-right" cx={168} cy={168} r={196} fill="#c8401f" />
    <circle data-anim data-motion="m-slide-left" cx={1112} cy={552} r={196} fill="#1c1b18" />
    <Emph data-anim data-motion="m-char-rise" x={640} y={396} size={fit(text, 96)} fill="#1c1b18" text={text} style={style} />
  </g>
);

/* ── 03 一个从来没有为谁疼过的人 ─────────────────────────────────────
   记住：剪影人形，胸口是一个洞。 */
const kj03: Scene = ({ text, style }) => (
  <g>
    <g data-anim data-motion="m-fade-up" fill="#2a2e30">
      <circle cx={640} cy={296} r={72} />
      <rect x={616} y={352} width={48} height={62} />
      <path d="M470 556 C500 382 780 382 810 556 L810 580 Q640 624 470 580 Z" />
    </g>
    <circle data-anim data-motion="m-scale-soft" cx={640} cy={472} r={38} fill="#dfe3e4" stroke="#2a2e30" strokeWidth={2.5} />
    <Emph data-anim data-motion="m-fade-up" x={640} y={682} size={fit(text, 62)} fill="#2a2e30" text={text} style={style} />
  </g>
);

/* ── 04 还是这辈子从来没真正在乎过什么 ───────────────────────────────
   记住：被深红划线划掉的巨大「在乎」（warm 亮朱红 = 被否定的情感投入）。 */
const kj04: Scene = ({ text, style }) => {
  const [pre, kw, post] = splitAround(text, "在乎");
  return (
    <g>
      <text x={640} y={214} textAnchor="middle" fontSize={36} fill="#8a867c" fontFamily={S}>{pre}</text>
      <text data-anim data-motion="m-zoom-in" x={640} y={470} textAnchor="middle" fontSize={288} fill={sem(style, "warm")} fontFamily={S} fontWeight={800}>
        {kw}
      </text>
      <path data-anim data-motion="m-stroke-draw" d="M244 356 L1036 396" stroke={sem(style, "danger")} strokeWidth={30} fill="none" />
      <text x={640} y={596} textAnchor="middle" fontSize={36} fill="#8a867c" fontFamily={S}>{post}</text>
    </g>
  );
};

/* ── 05 靠近你就靠近了痛苦 ───────────────────────────────────────────
   记住：暗红热成像，从亮心向外一圈圈冷却（danger 电光红）。 */
const kj05: Scene = ({ text, style }) => (
  <g>
    <g data-anim data-motion="m-zoom-in">
      {[430, 344, 262, 184, 112].map((r, i) => (
        <circle key={r} cx={640} cy={316} r={r} fill={sem(style, "danger")} opacity={0.05 + (4 - i) * 0.05} />
      ))}
    </g>
    <circle data-anim data-motion="m-flicker" cx={640} cy={316} r={46} fill={sem(style, "danger")} />
    <circle data-anim data-motion="m-flicker" cx={640} cy={316} r={18} fill="#ffd9c9" />
    <Emph data-anim data-motion="m-fade-up" x={640} y={634} size={fit(text, 88)} fill="#f3ede4" text={text} style={style} />
  </g>
);

/* ── 06 远离你就远离了幸福 ───────────────────────────────────────────
   记住：一颗暖光正在离开画面右上角，只留下渐隐的轨迹（幸福 = warm）。 */
const kj06: Scene = ({ text, style }) => (
  <g>
    <path data-anim data-motion="m-stroke-draw" d="M560 470 Q850 330 1058 186" stroke={sem(style, "warm")} strokeOpacity={0.5} strokeWidth={2.5} strokeDasharray="2 12" fill="none" />
    <g data-anim data-motion="m-slide-right">
      <circle cx={1082} cy={168} r={82} fill={sem(style, "warm")} opacity={0.16} />
      <circle cx={1082} cy={168} r={40} fill={sem(style, "warm")} />
      <circle cx={1082} cy={168} r={16} fill="#ffe0ef" />
    </g>
    <Emph data-anim data-motion="m-fade-up" x={640} y={620} size={fit(text, 88)} fill="#e8ecf6" text={text} style={style} />
  </g>
);

/* ── 07 这句话大多数人的读法是 ───────────────────────────────────────
   记住：一页书特写 —— 页眉线、巨大的引号、一道朱红阅读线。 */
const kj07: Scene = ({ text, style, beat }) => (
  <g>
    <line x1={104} y1={112} x2={1176} y2={112} stroke="#1c1b18" strokeWidth={3} />
    {/* 引文道：两道平行短竖（规则：上画面文字不带标点，故引文符号不用字形引号） */}
    <g fill="#ddd4bf">
      <rect x={116} y={182} width={24} height={124} rx={4} />
      <rect x={164} y={182} width={24} height={124} rx={4} />
    </g>
    <Emph data-anim data-motion="m-fade-up" x={640} y={408} size={fit(text, 74)} fill="#1c1b18" text={text} style={style} />
    <path data-anim data-motion="m-stroke-draw" d="M420 470 L860 470" stroke={sem(style, "warm")} strokeWidth={4} fill="none" />
    <text x={1176} y={664} textAnchor="end" fontSize={17} fill="#8a867c" fontFamily={S}>
      {`BEAT ${String(beat).padStart(2, "0")}`}
    </text>
  </g>
);

/* ── 08 不主动 ───────────────────────────────────────────────────────
   记住：一个「不」字压满画面，右下角一粒被压缩的红点。 */
const kj08: Scene = ({ text, style }) => {
  const [pre, kw, post] = splitAround(text, "主动");
  return (
    <g>
      <text data-anim data-motion="m-zoom-in" x={600} y={586} textAnchor="middle" fontSize={520} fill="#1c1b18" fontFamily={S}>
        {kw === "主动" ? pre : "不"}
      </text>
      <g data-anim data-motion="m-pulse">
        <circle cx={1044} cy={560} r={15} fill={sem(style, "warm")} />
        <text x={1044} y={612} textAnchor="middle" fontSize={24} fill={sem(style, "warm")} fontFamily={S}>{post}</text>
      </g>
    </g>
  );
};

/* ── 09 喜欢一个人的时候先在心里留个后门 ─────────────────────────────
   记住：暗房里一扇虚掩的门，门缝透出一线暖光。 */
const kj09: Scene = ({ text, style }) => (
  <g>
    <circle cx={636} cy={330} r={104} fill="#ffc46b" opacity={0.09} />
    <rect data-anim data-motion="m-fade-up" x={556} y={132} width={160} height={392} fill="none" stroke="#3a4a63" strokeWidth={3} />
    <rect data-anim data-motion="m-clip-reveal" x={631} y={136} width={9} height={384} fill="#ffc46b" />
    {lines(text, 8).map((ln, i) => (
      <Emph key={i} data-anim data-motion="m-fade-up" x={640} y={620 + i * 58} size={44} fill="#dfe6f2" text={ln} style={style} />
    ))}
  </g>
);

/* ── 10 这些人真的过得更好吗 ─────────────────────────────────────────
   记住：全宽大字底下一条抖动的朱红波浪（疑问的手写感）。 */
const kj10: Scene = ({ text, style }) => (
  <g>
    <Emph data-anim data-motion="m-char-rise" x={640} y={388} size={fit(text, 94)} fill="#1c1b18" text={text} style={style} />
    <path
      data-anim data-motion="m-stroke-draw"
      d="M236 442 Q336 462 436 444 T636 444 T836 444 T1036 444"
      stroke={sem(style, "warm")} strokeWidth={3.5} fill="none"
    />
  </g>
);

/* ── 11 不是不疼 ─────────────────────────────────────────────────────
   记住：纯黑里四个大字，「不疼」是暗处发红的那一半（danger）。 */
const kj11: Scene = ({ text, style }) => {
  const [pre, kw] = splitAround(text, "不疼");
  return (
    <g>
      <circle cx={800} cy={340} r={330} fill={sem(style, "danger")} opacity={0.13} />
      <circle cx={800} cy={340} r={200} fill={sem(style, "danger")} opacity={0.12} />
      <Emph data-anim data-motion="m-fade-up" x={430} y={392} size={150} fill="#f3ede4" text={pre} style={style} />
      <Emph data-anim data-motion="m-blur-in" x={830} y={392} size={150} fill="#f3ede4" text={kw} style={style} />
    </g>
  );
};

/* ── 12 没有尽头 ─────────────────────────────────────────────────────
   记住：一条地平线，消失点上一点青绿 —— 极简到只剩一条线。 */
const kj12: Scene = ({ text, style }) => (
  <g>
    <defs>
      <linearGradient id="kj12-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1c2836" />
        <stop offset="1" stopColor="#0d0f12" />
      </linearGradient>
    </defs>
    <rect x={0} y={0} width={1280} height={430} fill="url(#kj12-sky)" />
    <path data-anim data-motion="m-stroke-draw" d="M0 430 L1280 430" stroke="#3a4453" strokeWidth={2.5} fill="none" />
    <circle data-anim data-motion="m-fade-up" cx={640} cy={430} r={20} fill={sem(style, "safe")} opacity={0.22} />
    <circle data-anim data-motion="m-fade-up" cx={640} cy={430} r={6.5} fill={sem(style, "safe")} />
    <Emph data-anim data-motion="m-fade-up" x={640} y={626} size={fit(text, 92)} fill="#e6e9ef" text={text} style={style} />
  </g>
);

/* ── 13 不投入确实不会失恋 ───────────────────────────────────────────
   记住：冰冷的浅灰大字 —— 没有温度的一行（「失恋」仍按语义标 danger）。 */
const kj13: Scene = ({ text, style }) => {
  const [pre, kw] = splitAround(text, "不会失恋");
  return (
    <g>
      <Emph data-anim data-motion="m-fade-down" x={640} y={306} size={34} fill="#aab8be" text={pre} style={style} />
      <Emph data-anim data-motion="m-blur-in" x={640} y={448} size={fit(kw, 128)} fill="#8fa0a8" text={kw} style={style} />
    </g>
  );
};

/* ── 14 不下注的赌局 ─────────────────────────────────────────────────
   记住：赌桌绿上一道白弧，筹码孤零零停在正中 —— 没有押出去。 */
const kj14: Scene = ({ text, style }) => (
  <g>
    <path data-anim data-motion="m-stroke-draw" d="M-20 436 Q640 300 1300 436" stroke="#ece9e2" strokeWidth={2.5} fill="none" />
    <path data-anim data-motion="m-stroke-draw" d="M-20 476 Q640 340 1300 476" stroke="#ece9e2" strokeOpacity={0.35} strokeWidth={1.6} fill="none" />
    <g data-anim data-motion="m-scale-soft">
      <circle cx={640} cy={388} r={19} fill="#f3f0e8" />
      <circle cx={640} cy={388} r={11.5} fill="none" stroke="#0f3d2e" strokeWidth={2} />
      <circle cx={640} cy={388} r={5.5} fill="none" stroke="#0f3d2e" strokeWidth={1.2} />
    </g>
    <Emph data-anim data-motion="m-fade-up" x={640} y={644} size={fit(text, 84)} fill="#ece9e2" text={text} style={style} />
  </g>
);

/* ── 15 文学里有人把这条路走到了头 ───────────────────────────────────
   记住：旧纸上的一条墨路伸向远方，尽头一粒朱红。 */
const kj15: Scene = ({ text, style }) => (
  <g>
    <Emph data-anim data-motion="m-fade-up" x={640} y={168} size={fit(text, 46)} fill="#3a3226" text={text} style={style} />
    <path data-anim data-motion="m-rise-lines" d="M556 720 L618 302 L662 302 L724 720 Z" fill="#2b2620" />
    <circle data-anim data-motion="m-pulse" cx={640} cy={292} r={9} fill={sem(style, "danger")} />
  </g>
);

/* ── 16 离你越远 我就越爱你 ──────────────────────────────────────────
   记住：夜空两点光 —— 近处小而冷（你），远处大而暖（爱 = warm）。 */
const kj16: Scene = ({ text, style }) => (
  <g>
    <path data-anim data-motion="m-stroke-draw" d="M252 556 Q640 424 1028 196" stroke="#5a6fd6" strokeOpacity={0.42} strokeWidth={1.6} strokeDasharray="3 10" fill="none" />
    <g data-anim data-motion="m-fade-up">
      <circle cx={252} cy={556} r={26} fill="#7ea8ff" opacity={0.25} />
      <circle cx={252} cy={556} r={10} fill="#7ea8ff" />
    </g>
    <g data-anim data-motion="m-zoom-in">
      <circle cx={1028} cy={196} r={76} fill={sem(style, "warm")} opacity={0.18} />
      <circle cx={1028} cy={196} r={38} fill={sem(style, "warm")} />
      <circle cx={1028} cy={196} r={15} fill="#ffe0ef" />
    </g>
    <Emph data-anim data-motion="m-fade-up" x={640} y={430} size={fit(text, 86)} fill="#dfe6ff" text={text} style={style} />
  </g>
);

/* ── 17 结果她守住了纯粹 ─────────────────────────────────────────────
   记住：浅灰底上一颗雪白多面体 —— 干净得近乎隐形。 */
const kj17: Scene = ({ text, style }) => (
  <g>
    <g data-anim data-motion="m-rotate-in">
      <polygon points="640,218 764,300 764,442 640,524 516,442 516,300" fill="#fbfcfd" stroke="#98a2ab" strokeWidth={2.5} />
      <polygon points="640,218 764,300 640,372 516,300" fill="#ffffff" />
      <polygon points="640,372 764,442 640,524" fill="#e6ebef" />
      <polygon points="516,300 640,372 640,524" fill="#f2f5f7" />
    </g>
    <Emph data-anim data-motion="m-fade-up" x={640} y={648} size={fit(text, 66)} fill="#2a2e30" text={text} style={style} />
  </g>
);

/* ── 18 因为心理学上有个东西叫损失厌恶 ───────────────────────────────
   记住：六级下行台阶，一级比一级暗（损失 = 下行 + 明度递减）。 */
const kj18: Scene = ({ text, style }) => (
  <g>
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect
        key={i} data-anim data-motion="m-fade-up"
        x={128 + i * 176} y={128 + i * 82} width={176} height={82}
        fill="#8a7fc0" fillOpacity={1 - i * 0.165}
      />
    ))}
    {lines(text, 8).map((ln, i) => (
      <Emph key={i} data-anim data-motion="m-fade-up" x={1176} y={96 + i * 52} size={40} fill="#cfc9e8" text={ln} style={style} anchor="end" />
    ))}
  </g>
);

/* ── 19 记住的是丢的那一次 ───────────────────────────────────────────
   记住：九宫格里唯一的黑点，圈着一道朱红环。 */
const kj19: Scene = ({ text, style }) => {
  const grid: Array<[number, number]> = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push([460 + c * 180, 236 + r * 152]);
  return (
    <g>
      <Emph data-anim data-motion="m-fade-up" x={640} y={96} size={fit(text, 56)} fill="#1c1b18" text={text} style={style} />
      <g data-anim data-motion="m-fade-up">
        {grid.map(([x, y], i) => (i === 4 ? null : <circle key={i} cx={x} cy={y} r={50} fill="#c6c0b2" />))}
      </g>
      <circle data-anim data-motion="m-zoom-in" cx={640} cy={540} r={50} fill="#1c1b18" />
      <circle data-anim data-motion="m-stroke-draw" cx={640} cy={540} r={64} fill="none" stroke={sem(style, "danger")} strokeWidth={3.5} />
    </g>
  );
};

/* ── 20 同一个源头 ───────────────────────────────────────────────────
   记住：底部一点白光，五束青绿光路向上扇开 —— 全部来自同一起点。 */
const kj20: Scene = ({ text, style }) => (
  <g>
    <Emph data-anim data-motion="m-fade-up" x={640} y={104} size={fit(text, 74)} fill="#dfeee9" text={text} style={style} />
    {[-2, -1, 0, 1, 2].map((k) => (
      <path
        key={k} data-anim data-motion="m-stroke-draw"
        d={`M640 636 Q ${640 + k * 150} 430 ${640 + k * 226} 186`}
        stroke={sem(style, "safe")} strokeOpacity={0.92 - Math.abs(k) * 0.17}
        strokeWidth={2.6 - Math.abs(k) * 0.28} fill="none"
      />
    ))}
    <circle data-anim data-motion="m-flicker" cx={640} cy={636} r={26} fill={sem(style, "safe")} opacity={0.22} />
    <circle data-anim data-motion="m-flicker" cx={640} cy={636} r={10} fill="#f0fffb" />
  </g>
);

/* ── 21 这种疼是价格 ─────────────────────────────────────────────────
   记住：一张微微倾斜的价签，签上一个大字（疼 = danger、价签 = cost 语境）。 */
const kj21: Scene = ({ text, style }) => {
  const [, kw] = splitAround(text, "疼");
  return (
    <g>
      <g data-anim data-motion="m-rotate-in" transform="rotate(-8 640 356)">
        <rect x={498} y={236} width={284} height={240} rx={20} fill="#fdfbf6" stroke="#1c1b18" strokeWidth={3} />
        <circle cx={540} cy={278} r={13} fill="#f5f2ec" stroke="#1c1b18" strokeWidth={3} />
        <path d="M540 278 Q468 238 470 164" stroke="#1c1b18" strokeWidth={2.5} fill="none" />
        <text x={640} y={424} textAnchor="middle" fontSize={148} fill={sem(style, "danger")} fontFamily={S} fontWeight={800}>
          {kw}
        </text>
      </g>
      <Emph data-anim data-motion="m-fade-up" x={640} y={632} size={44} fill="#1c1b18" text={text} style={style} />
    </g>
  );
};

/* ── 22 我在乎 但我不怕 ──────────────────────────────────────────────
   记住：暗红黑里两行大字 —— 在乎是粉（warm）、不怕是青绿（safe）。 */
const kj22: Scene = ({ text, style }) => {
  const parts = text.split(" ").filter(Boolean);
  const l1 = parts[0] ?? text;
  const l2 = parts.slice(1).join(" ");
  return (
    <g>
      <circle cx={640} cy={370} r={400} fill={sem(style, "danger")} opacity={0.1} />
      <Emph data-anim data-motion="m-char-rise" x={640} y={330} size={132} fill="#f3ede4" text={l1} style={style} />
      <Emph data-anim data-motion="m-zoom-in" x={706} y={506} size={132} fill="#f3ede4" text={l2} style={style} />
    </g>
  );
};

/* ── 23 你在乎过的收据 ───────────────────────────────────────────────
   记住：暖纸上一张锯齿收据 + 左侧竖排大字（在乎 = warm 朱红），章为对勾。 */
const kj23: Scene = ({ text, style }) => {
  const [pre, kw] = splitAround(text, "收据");
  const zig: string[] = [`M756 126 L1084 126 L1084 548`];
  for (let x = 1084; x > 756; x -= 19) zig.push(`L${x - 9.5} 566 L${x - 19} 548`);
  zig.push("Z");
  return (
    <g>
      {segChars(pre).map((c, i) => (
        <text
          key={i} data-anim data-motion="m-char-rise"
          x={338} y={196 + i * 88} textAnchor="middle" fontSize={84} fontFamily={S}
          fill={c.tone ? sem(style, c.tone) : "#1c1b18"}
          fontWeight={c.tone ? 800 : 400}
        >
          {c.ch}
        </text>
      ))}
      <g data-anim data-motion="m-fade-up">
        <path d={zig.join(" ")} fill="#fffdf8" stroke="#d9cdb4" strokeWidth={1.5} />
        <text x={920} y={204} textAnchor="middle" fontSize={36} letterSpacing={10} fill="#1c1b18" fontFamily={S}>
          {kw.slice(0, 1) + "　" + kw.slice(1)}
        </text>
        {[252, 306, 360].map((y) => (
          <path key={y} d={`M800 ${y} L1040 ${y}`} stroke="#b9ad92" strokeWidth={1.5} strokeDasharray="7 7" fill="none" />
        ))}
        <Emph x={920} y={446} size={44} fill="#1c1b18" text="在乎过" style={style} />
        <circle cx={920} cy={510} r={42} fill="none" stroke={sem(style, "danger")} strokeWidth={4} opacity={0.85} />
        <path d="M902 510 L914 522 L940 494" stroke={sem(style, "danger")} strokeWidth={4.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
};

/* ── 注册表：id ↔ 场景。覆写 JSON 用 layout.custom 点名。 ─────────── */
export const KAOJIN_SCENES: Record<string, Scene> = {
  "kj-01": kj01, "kj-02": kj02, "kj-03": kj03, "kj-04": kj04, "kj-05": kj05,
  "kj-06": kj06, "kj-07": kj07, "kj-08": kj08, "kj-09": kj09, "kj-10": kj10,
  "kj-11": kj11, "kj-12": kj12, "kj-13": kj13, "kj-14": kj14, "kj-15": kj15,
  "kj-16": kj16, "kj-17": kj17, "kj-18": kj18, "kj-19": kj19, "kj-20": kj20,
  "kj-21": kj21, "kj-22": kj22, "kj-23": kj23,
};
