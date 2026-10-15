// 《遗忘》专属场景集 —— 5 拍完全重做。
//
// 与既有素材的关系：**一律不复用**。
//   · 不查 catalog（196 个槽位版式）
//   · 不引 figures / assets / charts（20+20+18 个现成图形）
//   · layout.decor = false 关掉母版装饰层（点阵 / 四角角标 / 底部进度条）
//   · layout.fx = "none" 关掉 canvas 粒子特效
// 每拍一幅手绘满版画面，只被导演覆写点名（layout.custom），不进自动挑选池。
//
// 视觉语言（与《靠近还是远离》刻意区分）：
//   kaojin = 满版纯色场 + 单色线框几何 + 压场大字
//   wangji = 细密手绘肌理 + 负空间 + 单一高饱和强调点；字形本身即图形
// 语义色仍走 emphasis.ts 的 SEM_ROLES —— 语义 token 跨片恒定，
// 但词表按本片论题单独定义（WJ_RULES）：通用表是上一部片的用词，本片一句都不命中
// （见 plan/缺口清单.md §5）。
//
// 动效契约：关键元素标 data-anim + data-motion，由 stage 的通用调度驱动
// （DOM 顺序即入场顺序，0.08s 级联）。确定性数据一律走 mulberry32，不用 Math.random。

import { emphasize, SEM_COLORS, SEM_SCALE, SEM_WEIGHT, type SemTone } from "./emphasis";
import { mulberry32 } from "../core/rng";
import type { Style } from "./types";

const S = '"Source Han Serif SC","Noto Serif SC","Songti SC",SimSun,serif';

export interface SceneProps {
  /** 本拍完整台词（来自旁白，诚实约束：场景不得引入台词之外的字） */
  text: string;
  /** 拍序号 */
  beat: number;
  /** 视觉风格 —— 决定语义色取值（editorial 低饱和 / flat-vector 明快 / chart-motion 数据感） */
  style: Style;
}

type Scene = (p: SceneProps) => JSX.Element;

/** 本片语义词表：刻画「失去 vs 留存」这条主轴，与通用表并集使用。 */
const WJ_RULES: Array<{ t: string; tone: SemTone }> = [
  { t: "故障", tone: "danger" }, // 被否定的对象（片子在为遗忘辩护）
  { t: "退场", tone: "danger" }, // 失去的发生
  { t: "留下", tone: "safe" }, // 不被失去
  { t: "记得", tone: "safe" },
  { t: "最常用", tone: "warm" }, // 全片落点
];

/**
 * 断行：**空格优先**（本片 SRT 按项目规则已把所有标点换成了空格，空格即语义停顿），
 * 再贪心合并到不超过 max 字；单段本身超 max 时按字数硬断。
 */
function wrap(text: string, max: number): string[] {
  const segs: string[] = [];
  for (const s of text.split(/\s+/).filter(Boolean)) {
    const ch = Array.from(s);
    if (ch.length <= max) segs.push(s);
    else for (let i = 0; i < ch.length; i += max) segs.push(ch.slice(i, i + max).join(""));
  }
  const out: string[] = [];
  let cur = "";
  for (const s of segs) {
    const n = cur ? [...cur].length + 1 + [...s].length : [...s].length;
    if (cur && n > max) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** 单行文本 + 行内语义强调（换色放大加粗，与版式库同参）。 */
function Emph(props: {
  x: number; y: number; size: number; fill: string; text: string;
  style: Style; anchor?: "start" | "middle" | "end"; spacing?: number;
}) {
  const segs = emphasize(props.text, WJ_RULES);
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

/**
 * 台词块：断行 + 字号按最长行与可用高度双向自适应，整体以 cy 为垂直中心对称生长，
 * 逐行级联入场。行数变了不会溢出画面 —— 这是去标点后行数不再固定的必要保障。
 */
function TextBlock(props: {
  text: string; cy: number; max: number; cap: number; maxH: number; fill: string;
  style: Style; x?: number; anchor?: "start" | "middle" | "end";
}) {
  const rows = wrap(props.text, props.max);
  const longest = Math.max(...rows.map((r) => [...r].length), 1);
  const size = Math.max(
    20,
    Math.min(props.cap, Math.floor(1080 / longest), Math.floor(props.maxH / (rows.length * 1.28))),
  );
  const lh = Math.round(size * 1.28);
  const first = props.cy - ((rows.length - 1) * lh) / 2;
  return (
    <g>
      {rows.map((r, i) => (
        <g key={i} data-anim data-motion="m-fade-up">
          <Emph x={props.x ?? 640} y={first + i * lh} size={size} fill={props.fill} text={r} style={props.style} anchor={props.anchor} />
        </g>
      ))}
    </g>
  );
}

/** 三次贝塞尔采样（脚印沿路径分布用）。 */
type P = [number, number];
function cubic(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/* ── 01 遗忘，不是记忆的故障 ─────────────────────────────────────────
   记住：一堵由细密刻痕构成的记忆墙；「遗忘」压在左侧，「故障」被朱红双划撤销。 */
const WALL: Array<{ x: number; y: number; w: number; o: number }> = (() => {
  const rnd = mulberry32(0x20261014);
  return Array.from({ length: 250 }, () => ({
    x: 62 + rnd() * 1156,
    y: 74 + rnd() * 404,
    w: 22 + rnd() * 160,
    o: 0.07 + rnd() * 0.3,
  }));
})();

const wj01: Scene = ({ text, style }) => (
  <g>
    <g data-anim data-motion="m-fade-up">
      {WALL.map((s, i) => (
        <rect key={i} x={s.x} y={s.y} width={s.w} height={2.2} fill="#8b8474" opacity={s.o} />
      ))}
    </g>
    <g data-anim data-motion="m-char-rise">
      <text x={306} y={446} textAnchor="middle" fontSize={196} fill="#201d19" fontFamily={S} fontWeight={700}>遗忘</text>
    </g>
    <g data-anim data-motion="m-fade-up">
      <text x={924} y={426} textAnchor="middle" fontSize={124} fill="#9d9487" fontFamily={S} fontWeight={700}>故障</text>
    </g>
    <g data-anim data-motion="m-stroke-draw" stroke={SEM_COLORS[style].danger} strokeLinecap="round" fill="none">
      <path d="M776 372 L1076 484" strokeWidth={11} />
      <path d="M800 478 L1098 352" strokeWidth={6.5} />
    </g>
    <TextBlock text={text} cy={640} max={11} cap={64} maxH={150} fill="#201d19" style={style} />
  </g>
);

/* ── 02 它是筛选，大脑每天都在做 ─────────────────────────────────────
   记住：一夜色里的筛网 —— 上方密点、网、下方只剩少量更亮的点。 */
const SIEVE = (() => {
  const rnd = mulberry32(0x7e2026);
  return {
    above: Array.from({ length: 160 }, () => ({
      x: 296 + rnd() * 688,
      y: 62 + rnd() * 190,
      r: 2 + rnd() * 3.6,
      o: 0.2 + rnd() * 0.5,
    })),
    below: Array.from({ length: 16 }, () => ({
      x: 424 + rnd() * 432,
      y: 468 + rnd() * 84,
      r: 3 + rnd() * 3.2,
    })),
  };
})();

const wj02: Scene = ({ text, style }) => (
  <g>
    <g data-anim data-motion="m-fade-up">
      {SIEVE.above.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#8fb0dd" opacity={d.o} />
      ))}
    </g>
    <g data-anim data-motion="m-stroke-draw" stroke="#2f4658" strokeWidth={2} fill="none">
      {Array.from({ length: 11 }, (_, i) => (
        <line key={`v${i}`} x1={340 + i * 60} y1={296} x2={340 + i * 60} y2={440} />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={`h${i}`} x1={340} y1={296 + i * 36} x2={940} y2={296 + i * 36} />
      ))}
    </g>
    <g data-anim data-motion="m-blur-in">
      {SIEVE.below.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#d8e9ff" opacity={0.9} />
      ))}
    </g>
    <TextBlock text={text} cy={628} max={11} cap={62} maxH={150} fill="#cfd8e6" style={style} />
  </g>
);

/* ── 03 每段经历进来，都要回答一句——你还会用到我吗 ─────────────────
   记住：一条传送带上五段经历被送向右侧闸口，门内一个巨大的问号。 */
const wj03: Scene = ({ text, style }) => (
  <g>
    <TextBlock text={text} cy={190} max={11} cap={60} maxH={230} fill="#2a2721" style={style} />
    <g data-anim data-motion="m-fade-up">
      <rect x={936} y={330} width={11} height={260} fill="#3c3730" />
      <rect x={1096} y={330} width={11} height={260} fill="#3c3730" />
      <rect x={932} y={316} width={179} height={14} fill="#3c3730" />
    </g>
    {/* 审视之光：门楣一盏灯，光锥打在门下的经历上 ——「都要回答」的关卡感（不用问号：标点不上画面） */}
    <g data-anim data-motion="m-zoom-in">
      <path d="M1006 332 L938 522 L1104 522 Z" fill="#e3cb8f" opacity={0.42} />
      <path d="M1006 332 L972 522 L1050 522 Z" fill="#f3e6ba" opacity={0.5} />
      <circle cx={1021} cy={330} r={7} fill="#1c1b18" />
      <circle cx={1021} cy={330} r={13} fill="none" stroke="#1c1b18" strokeWidth={2.5} />
    </g>
    <g data-anim data-motion="m-fade-up">
      {[0, 1, 2, 3, 4].map((i) => {
        const shade = ["#e6dfd0", "#cfc6b3", "#b0a692", "#8a8171", "#4f483d"][i]!;
        const x = 128 + i * 158;
        return (
          <g key={i}>
            <rect x={x} y={516} width={112} height={76} fill={shade} />
            {[0, 1, 2].map((j) => (
              <rect key={j} x={x + 14} y={536 + j * 18} width={84 - j * 18} height={3} fill="#1c1b18" opacity={0.22} />
            ))}
          </g>
        );
      })}
    </g>
    <g data-anim data-motion="m-stroke-draw" stroke="#6c6558" strokeWidth={2.5} fill="none">
      <line x1={78} y1={600} x2={1212} y2={600} />
    </g>
    <g data-anim data-motion="m-fade-up">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <circle key={i} cx={122 + i * 150} cy={632} r={14} fill="none" stroke="#8a8274" strokeWidth={2} />
      ))}
    </g>
  </g>
);

/* ── 04 被反复叫到的，留下；其余的，安静退场 ────────────────────────
   记住：一点亮光分岔成两条路 —— 左路越走越粗越亮（留下），右路越走越细越淡（退场）。 */
const CALLED: P[] = [[604, 250], [546, 296], [492, 340], [442, 378], [396, 412], [354, 444], [316, 474]];
const GONE: P[] = [[676, 250], [722, 292], [766, 330], [808, 366], [848, 400], [886, 430], [922, 458], [956, 484]];

const wj04: Scene = ({ text, style }) => {
  const safe = SEM_COLORS[style].safe;
  return (
    <g>
      <g data-anim data-motion="m-fade-up">
        <circle cx={640} cy={122} r={36} fill="#eef4f2" opacity={0.14} />
        <circle cx={640} cy={122} r={16} fill="#eef4f2" />
      </g>
      <path data-anim data-motion="m-stroke-draw" d="M640 154 L640 200" stroke="#8b98a4" strokeWidth={5} fill="none" />
      <g data-anim data-motion="m-stroke-draw" fill="none" strokeLinecap="round">
        <path d="M640 200 Q560 258 476 320" stroke={safe} strokeOpacity={0.34} strokeWidth={4} />
        <path d="M476 320 Q392 382 336 438" stroke={safe} strokeOpacity={0.62} strokeWidth={8} />
        <path d="M336 438 Q292 480 276 512" stroke={safe} strokeOpacity={0.95} strokeWidth={14} />
      </g>
      <g data-anim data-motion="m-fade-up">
        {CALLED.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={9 - i * 0.5} fill="#f2fffb" />
        ))}
        {[[476, 320], [396, 412], [316, 474]].map(([x, y], i) => (
          <g key={i} stroke={safe} strokeWidth={2.2} fill="none" opacity={0.75}>
            <path d={`M${x! - 17} ${y! - 15} A 23 23 0 0 1 ${x! + 17} ${y! - 15}`} />
            <path d={`M${x! - 27} ${y! - 26} A 36 36 0 0 1 ${x! + 27} ${y! - 26}`} opacity={0.45} />
          </g>
        ))}
      </g>
      <g data-anim data-motion="m-stroke-draw" fill="none" strokeLinecap="round">
        <path d="M640 200 Q720 258 806 320" stroke="#5a6570" strokeOpacity={0.7} strokeWidth={5} />
        <path d="M806 320 Q890 382 946 438" stroke="#46505a" strokeOpacity={0.42} strokeWidth={3} />
        <path d="M946 438 Q990 480 1006 512" stroke="#2c343c" strokeOpacity={0.22} strokeWidth={1.6} />
      </g>
      <g data-anim data-motion="m-blur-in">
        {GONE.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={7 - i * 0.7} fill="#7d8994" opacity={0.66 - i * 0.07} />
        ))}
      </g>
      <circle data-anim data-motion="m-scale-soft" cx={266} cy={532} r={40} fill="none" stroke={safe} strokeWidth={3.5} />
      <circle data-anim data-motion="m-fade-up" cx={1022} cy={532} r={40} fill="none" stroke="#39424b" strokeWidth={2} strokeDasharray="5 9" />
      <TextBlock text={text} cy={642} max={11} cap={58} maxH={140} fill="#e2e8ee" style={style} />
    </g>
  );
};

/* ── 05 你记得的，不是最清楚的，而是最常用的 ────────────────────────
   记住：一片地面上五条小径；中间那条最宽最深、脚印最密 —— 它未必最"清楚"。 */
interface Trail {
  p0: P; p1: P; p2: P; p3: P;
  w: number; color: string; step: number; stepW: number; stepLen: number; stepColor: string;
}
const TRAILS: Trail[] = [
  { p0: [150, 646], p1: [300, 604], p2: [520, 528], p3: [700, 470], w: 7, color: "#d2cabb", step: 3, stepW: 2, stepLen: 6, stepColor: "#a89f8f" },
  { p0: [150, 646], p1: [330, 566], p2: [620, 476], p3: [880, 400], w: 7, color: "#d2cabb", step: 2, stepW: 2, stepLen: 6, stepColor: "#a89f8f" },
  { p0: [150, 646], p1: [390, 596], p2: [820, 448], p3: [1156, 318], w: 17, color: "#c6bdac", step: 26, stepW: 3.6, stepLen: 11, stepColor: "#1c1b18" },
  { p0: [150, 646], p1: [400, 640], p2: [880, 566], p3: [1176, 508], w: 7, color: "#d2cabb", step: 3, stepW: 2, stepLen: 6, stepColor: "#a89f8f" },
  { p0: [150, 646], p1: [380, 680], p2: [760, 664], p3: [1000, 640], w: 7, color: "#d2cabb", step: 2, stepW: 2, stepLen: 6, stepColor: "#a89f8f" },
];

/** 沿三次贝塞尔均匀取 n 个"脚印"（垂直于路径的短横）。 */
function steps(t: Trail, n: number) {
  const out: Array<{ x: number; y: number; a: number }> = [];
  for (let i = 1; i <= n; i++) {
    const u = i / (n + 1);
    const [x, y] = cubic(t.p0, t.p1, t.p2, t.p3, u);
    const [nx, ny] = cubic(t.p0, t.p1, t.p2, t.p3, Math.min(1, u + 0.01));
    out.push({ x, y, a: Math.atan2(ny - y, nx - x) });
  }
  return out;
}

const wj05: Scene = ({ text, style }) => (
  <g>
    <g data-anim data-motion="m-fade-up">
      {TRAILS.map((t, i) => (
        <path
          key={i}
          d={`M${t.p0[0]} ${t.p0[1]} C ${t.p1[0]} ${t.p1[1]} ${t.p2[0]} ${t.p2[1]} ${t.p3[0]} ${t.p3[1]}`}
          stroke={t.color} strokeWidth={t.w} fill="none" strokeLinecap="round"
        />
      ))}
    </g>
    <g data-anim data-motion="m-fade-up">
      {TRAILS.flatMap((t, i) =>
        steps(t, t.step).map((s, j) => {
          const px = -Math.sin(s.a) * t.stepLen;
          const py = Math.cos(s.a) * t.stepLen;
          return (
            <line
              key={`${i}-${j}`}
              x1={s.x - px} y1={s.y - py} x2={s.x + px} y2={s.y + py}
              stroke={t.stepColor} strokeWidth={t.stepW} strokeLinecap="round"
              opacity={t.stepColor === "#1c1b18" ? 0.85 : 0.5}
            />
          );
        }),
      )}
    </g>
    <g data-anim data-motion="m-zoom-in">
      <path d="M150 626 L150 666 M130 646 L170 646" stroke="#6d6559" strokeWidth={2.4} />
      <path d="M478 556 L478 574 M469 565 L487 565" stroke="#8a8175" strokeWidth={2} />
    </g>
    <TextBlock text={text} x={110} anchor="start" cy={214} max={11} cap={58} maxH={260} fill="#201d19" style={style} />
  </g>
);

/* ── 注册表：id ↔ 场景。覆写 JSON 用 layout.custom 点名。 ─────────── */
export const WANGJI_SCENES: Record<string, Scene> = {
  "wj-01": wj01, "wj-02": wj02, "wj-03": wj03, "wj-04": wj04, "wj-05": wj05,
};
