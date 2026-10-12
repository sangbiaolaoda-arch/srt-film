/*
 * srt-film · 纯 SVG 素材库
 * ------------------------------------------------------------------
 * 20 个纯函数式 React 素材组件（图标 / 设备框 / 纹理）。
 *
 * 设计约束：
 *  - 只使用 <svg> <g> <path> <rect> <circle> <line> <polyline> <polygon>
 *    <text> <defs> <linearGradient> <clipPath> <pattern> 这些画布安全的元素；
 *    绝不使用 foreignObject / <image> / 外链 url() / 外部字体，
 *    以保证序列化进 canvas 时不会污染导出。
 *  - 无 hooks，无副作用，确定性（噪点用基于 index 的伪随机，不用 Math.random）。
 *  - 默认描边 currentColor；传入 tone 时映射到固定色值。
 *  - 根节点不画背景（纹理类除外）。
 * ------------------------------------------------------------------
 */

export type AssetId =
  | "icon-check" | "icon-cross" | "icon-arrow-right" | "icon-clock" | "icon-globe"
  | "icon-cpu" | "icon-db" | "icon-wifi" | "icon-lock" | "icon-coin"
  | "icon-leaf" | "icon-sun" | "icon-warning" | "icon-star"
  | "device-phone" | "device-laptop" | "window-browser"
  | "grid-blueprint" | "tex-noise" | "shape-blob";

export interface AssetProps {
  id: AssetId;
  w: number;
  h: number;
  tone?: "ink" | "dim" | "accent" | "paper";
}

/** 画廊遍历用清单（含全部 20 个素材）。 */
export const ASSET_IDS: AssetId[] = [
  "icon-check",
  "icon-cross",
  "icon-arrow-right",
  "icon-clock",
  "icon-globe",
  "icon-cpu",
  "icon-db",
  "icon-wifi",
  "icon-lock",
  "icon-coin",
  "icon-leaf",
  "icon-sun",
  "icon-warning",
  "icon-star",
  "device-phone",
  "device-laptop",
  "window-browser",
  "grid-blueprint",
  "tex-noise",
  "shape-blob",
];

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

type Tone = NonNullable<AssetProps["tone"]>;

const TONE_HEX: Record<Tone, string> = {
  ink: "#1c1b18",
  dim: "#8a867c",
  accent: "#c8401f",
  paper: "#faf9f6",
};

/** 未传 tone 时沿用 currentColor，传入时映射到固定色值。 */
function resolveTone(tone?: Tone): string {
  return tone ? TONE_HEX[tone] : "currentColor";
}

/** 保留两位小数，避免浮点噪声，保证输出稳定。 */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 基于索引的确定性伪随机，返回 [0, 1)。 */
function rand(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface Frame {
  /** 线宽（随尺寸缩放，带下限）。 */
  readonly sw: number;
  /** 归一化长度 → 绝对长度。 */
  len(v: number): number;
  /** 归一化 x → 绝对 x。 */
  x(v: number): number;
  /** 归一化 y → 绝对 y。 */
  y(v: number): number;
}

/**
 * 把 [0,1] 归一化坐标映射到「以 min(w,h) 为基准、四周留白的正方形」区域。
 * 所有图形都按此绘制，因此缩放到任意 w/h 都会等比、居中、不走形。
 */
function frame(w: number, h: number, pad = 0.12): Frame {
  const s = Math.min(w, h);
  const u = s * (1 - pad * 2);
  const ox = (w - s) / 2 + s * pad;
  const oy = (h - s) / 2 + s * pad;
  return {
    sw: r2(Math.max(0.6, s * 0.075)),
    len: (v) => r2(v * u),
    x: (v) => r2(ox + v * u),
    y: (v) => r2(oy + v * u),
  };
}

/** 用两段椭圆弧拼出完整椭圆（避免使用 <ellipse>）。 */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M ${r2(cx - rx)} ${cy} ` +
    `A ${rx} ${ry} 0 1 0 ${r2(cx + rx)} ${cy} ` +
    `A ${rx} ${ry} 0 1 0 ${r2(cx - rx)} ${cy} Z`
  );
}

function assertNever(x: never): never {
  throw new Error("unknown asset id: " + String(x));
}

/* ------------------------------------------------------------------ *
 * 图标（内部坐标按 min(w,h) 归一化）
 * ------------------------------------------------------------------ */

function IconCheck(f: Frame, c: string): JSX.Element {
  return (
    <polyline
      points={`${f.x(0.14)},${f.y(0.54)} ${f.x(0.4)},${f.y(0.79)} ${f.x(0.86)},${f.y(0.22)}`}
      stroke={c}
      strokeWidth={f.sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function IconCross(f: Frame, c: string): JSX.Element {
  return (
    <g stroke={c} strokeWidth={f.sw} strokeLinecap="round">
      <line x1={f.x(0.22)} y1={f.y(0.22)} x2={f.x(0.78)} y2={f.y(0.78)} />
      <line x1={f.x(0.78)} y1={f.y(0.22)} x2={f.x(0.22)} y2={f.y(0.78)} />
    </g>
  );
}

function IconArrowRight(f: Frame, c: string): JSX.Element {
  return (
    <g stroke={c} strokeWidth={f.sw} strokeLinecap="round" strokeLinejoin="round">
      <line x1={f.x(0.12)} y1={f.y(0.5)} x2={f.x(0.86)} y2={f.y(0.5)} />
      <polyline
        points={`${f.x(0.6)},${f.y(0.24)} ${f.x(0.86)},${f.y(0.5)} ${f.x(0.6)},${f.y(0.76)}`}
      />
    </g>
  );
}

function IconClock(f: Frame, c: string): JSX.Element {
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx={f.x(0.5)} cy={f.y(0.5)} r={f.len(0.4)} />
      <line x1={f.x(0.5)} y1={f.y(0.5)} x2={f.x(0.5)} y2={f.y(0.24)} />
      <line x1={f.x(0.5)} y1={f.y(0.5)} x2={f.x(0.7)} y2={f.y(0.6)} />
    </g>
  );
}

function IconGlobe(f: Frame, c: string): JSX.Element {
  const cy = f.y(0.5);
  const R = f.len(0.4);
  const rx = f.len(0.18);
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none">
      <circle cx={f.x(0.5)} cy={cy} r={R} />
      {/* 经线（竖椭圆） */}
      <path
        d={
          `M ${f.x(0.32)} ${cy} ` +
          `A ${rx} ${R} 0 1 0 ${f.x(0.68)} ${cy} ` +
          `A ${rx} ${R} 0 1 0 ${f.x(0.32)} ${cy} Z`
        }
      />
      {/* 赤道（纬线） */}
      <line x1={f.x(0.1)} y1={cy} x2={f.x(0.9)} y2={cy} />
    </g>
  );
}

function IconCpu(f: Frame, c: string): JSX.Element {
  const pins = Array.from({ length: 4 }, (_, i) => {
    const v = 0.32 + i * 0.12;
    return (
      <g key={i}>
        <line x1={f.x(0.13)} y1={f.y(v)} x2={f.x(0.24)} y2={f.y(v)} />
        <line x1={f.x(0.76)} y1={f.y(v)} x2={f.x(0.87)} y2={f.y(v)} />
        <line x1={f.x(v)} y1={f.y(0.13)} x2={f.x(v)} y2={f.y(0.24)} />
        <line x1={f.x(v)} y1={f.y(0.76)} x2={f.x(v)} y2={f.y(0.87)} />
      </g>
    );
  });
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinejoin="round" strokeLinecap="round">
      <rect x={f.x(0.24)} y={f.y(0.24)} width={f.len(0.52)} height={f.len(0.52)} rx={f.len(0.04)} />
      <rect x={f.x(0.4)} y={f.y(0.4)} width={f.len(0.2)} height={f.len(0.2)} />
      {pins}
    </g>
  );
}

function IconDb(f: Frame, c: string): JSX.Element {
  const rxC = f.len(0.32);
  const ryC = f.len(0.11);
  const cxC = f.x(0.5);
  const lx = f.x(0.18);
  const rxX = f.x(0.82);
  const topY = f.y(0.2);
  const midY = f.y(0.5);
  const botY = f.y(0.8);
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round">
      <path d={ellipsePath(cxC, topY, rxC, ryC)} />
      <line x1={lx} y1={topY} x2={lx} y2={botY} />
      <line x1={rxX} y1={topY} x2={rxX} y2={botY} />
      <path d={`M ${lx} ${midY} A ${rxC} ${ryC} 0 0 0 ${rxX} ${midY}`} />
      <path d={`M ${lx} ${botY} A ${rxC} ${ryC} 0 0 0 ${rxX} ${botY}`} />
    </g>
  );
}

function IconWifi(f: Frame, c: string): JSX.Element {
  const baseY = 0.82;
  const k = 0.7071;
  const radii = [0.16, 0.3, 0.44];
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round">
      {radii.map((R, i) => (
        <path
          key={i}
          d={
            `M ${f.x(0.5 - k * R)} ${f.y(baseY - k * R)} ` +
            `A ${f.len(R)} ${f.len(R)} 0 0 1 ${f.x(0.5 + k * R)} ${f.y(baseY - k * R)}`
          }
        />
      ))}
      <circle cx={f.x(0.5)} cy={f.y(baseY + 0.06)} r={f.len(0.045)} fill={c} stroke="none" />
    </g>
  );
}

function IconLock(f: Frame, c: string): JSX.Element {
  const rShackle = f.len(0.14);
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* 锁环 */}
      <path
        d={
          `M ${f.x(0.36)} ${f.y(0.46)} L ${f.x(0.36)} ${f.y(0.34)} ` +
          `A ${rShackle} ${rShackle} 0 0 1 ${f.x(0.64)} ${f.y(0.34)} ` +
          `L ${f.x(0.64)} ${f.y(0.46)}`
        }
      />
      {/* 锁体 */}
      <rect x={f.x(0.26)} y={f.y(0.46)} width={f.len(0.48)} height={f.len(0.36)} rx={f.len(0.06)} />
      <circle cx={f.x(0.5)} cy={f.y(0.64)} r={f.len(0.05)} fill={c} stroke="none" />
    </g>
  );
}

function IconCoin(f: Frame, c: string): JSX.Element {
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round">
      <circle cx={f.x(0.5)} cy={f.y(0.5)} r={f.len(0.38)} />
      <circle cx={f.x(0.5)} cy={f.y(0.5)} r={f.len(0.28)} />
      <line x1={f.x(0.5)} y1={f.y(0.28)} x2={f.x(0.5)} y2={f.y(0.72)} />
    </g>
  );
}

function IconLeaf(f: Frame, c: string): JSX.Element {
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* 叶形轮廓 */}
      <path
        d={
          `M ${f.x(0.5)} ${f.y(0.08)} ` +
          `C ${f.x(0.88)} ${f.y(0.26)} ${f.x(0.9)} ${f.y(0.62)} ${f.x(0.5)} ${f.y(0.92)} ` +
          `C ${f.x(0.1)} ${f.y(0.62)} ${f.x(0.12)} ${f.y(0.26)} ${f.x(0.5)} ${f.y(0.08)} Z`
        }
      />
      {/* 主叶脉 */}
      <path d={`M ${f.x(0.5)} ${f.y(0.9)} C ${f.x(0.5)} ${f.y(0.6)} ${f.x(0.5)} ${f.y(0.4)} ${f.x(0.5)} ${f.y(0.16)}`} />
    </g>
  );
}

function IconSun(f: Frame, c: string): JSX.Element {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return (
      <line
        key={i}
        x1={f.x(0.5 + ca * 0.3)}
        y1={f.y(0.5 + sa * 0.3)}
        x2={f.x(0.5 + ca * 0.45)}
        y2={f.y(0.5 + sa * 0.45)}
      />
    );
  });
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round">
      <circle cx={f.x(0.5)} cy={f.y(0.5)} r={f.len(0.2)} />
      {rays}
    </g>
  );
}

function IconWarning(f: Frame, c: string): JSX.Element {
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polygon
        points={`${f.x(0.5)},${f.y(0.12)} ${f.x(0.9)},${f.y(0.84)} ${f.x(0.1)},${f.y(0.84)}`}
      />
      <line x1={f.x(0.5)} y1={f.y(0.42)} x2={f.x(0.5)} y2={f.y(0.62)} />
      <circle cx={f.x(0.5)} cy={f.y(0.72)} r={f.len(0.035)} fill={c} stroke="none" />
    </g>
  );
}

function IconStar(f: Frame, c: string): JSX.Element {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? 0.44 : 0.19;
    pts.push(`${f.x(0.5 + Math.cos(a) * rad)},${f.y(0.5 + Math.sin(a) * rad)}`);
  }
  return (
    <polygon points={pts.join(" ")} stroke={c} strokeWidth={f.sw} fill="none" strokeLinejoin="round" />
  );
}

/* ------------------------------------------------------------------ *
 * 设备框 / 窗口
 * ------------------------------------------------------------------ */

function DevicePhone(f: Frame, c: string): JSX.Element {
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={f.x(0.3)} y={f.y(0.06)} width={f.len(0.4)} height={f.len(0.88)} rx={f.len(0.08)} />
      {/* 顶部听筒条 */}
      <line x1={f.x(0.44)} y1={f.y(0.13)} x2={f.x(0.56)} y2={f.y(0.13)} />
      {/* 屏幕内框 */}
      <rect x={f.x(0.36)} y={f.y(0.2)} width={f.len(0.28)} height={f.len(0.6)} rx={f.len(0.02)} />
    </g>
  );
}

function DeviceLaptop(f: Frame, c: string): JSX.Element {
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* 屏幕 */}
      <rect x={f.x(0.2)} y={f.y(0.16)} width={f.len(0.6)} height={f.len(0.46)} rx={f.len(0.03)} />
      {/* 底座梯形 */}
      <polygon
        points={
          `${f.x(0.1)},${f.y(0.68)} ${f.x(0.9)},${f.y(0.68)} ` +
          `${f.x(0.98)},${f.y(0.82)} ${f.x(0.02)},${f.y(0.82)}`
        }
      />
    </g>
  );
}

function WindowBrowser(f: Frame, c: string): JSX.Element {
  const dot = f.len(0.026);
  const barY = f.y(0.32);
  return (
    <g stroke={c} strokeWidth={f.sw} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={f.x(0.06)} y={f.y(0.14)} width={f.len(0.88)} height={f.len(0.72)} rx={f.len(0.05)} />
      {/* 标题栏分隔线 */}
      <line x1={f.x(0.06)} y1={barY} x2={f.x(0.94)} y2={barY} />
      <circle cx={f.x(0.16)} cy={f.y(0.23)} r={dot} fill={c} stroke="none" />
      <circle cx={f.x(0.245)} cy={f.y(0.23)} r={dot} fill={c} stroke="none" />
      <circle cx={f.x(0.33)} cy={f.y(0.23)} r={dot} fill={c} stroke="none" />
      {/* 内容区示意 */}
      <line x1={f.x(0.16)} y1={f.y(0.48)} x2={f.x(0.72)} y2={f.y(0.48)} strokeWidth={f.sw * 0.7} />
      <line x1={f.x(0.16)} y1={f.y(0.62)} x2={f.x(0.56)} y2={f.y(0.62)} strokeWidth={f.sw * 0.7} />
    </g>
  );
}

/* ------------------------------------------------------------------ *
 * 纹理 / 形状（允许大面积绘制）
 * ------------------------------------------------------------------ */

function GridBlueprint(c: string, w: number, h: number): JSX.Element {
  const n = 8;
  const sw = r2(Math.max(0.4, Math.min(w, h) * 0.006));
  const lines: JSX.Element[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    lines.push(<line key={`v${i}`} x1={r2(w * t)} y1={0} x2={r2(w * t)} y2={h} />);
    lines.push(<line key={`h${i}`} x1={0} y1={r2(h * t)} x2={w} y2={r2(h * t)} />);
  }
  return (
    <g stroke={c} strokeWidth={sw} opacity={0.45}>
      {lines}
    </g>
  );
}

function TexNoise(c: string, w: number, h: number): JSX.Element {
  const base = Math.max(0.6, Math.min(w, h) * 0.005);
  const count = Math.max(24, Math.round((w * h) / 240));
  const dots = Array.from({ length: count }, (_, i) => {
    const px = r2(rand(i * 3 + 1) * w);
    const py = r2(rand(i * 3 + 2) * h);
    const rr = r2(base * (0.6 + rand(i * 3 + 3) * 0.9));
    return <circle key={i} cx={px} cy={py} r={rr} fill={c} />;
  });
  return <g opacity={0.35}>{dots}</g>;
}

function ShapeBlob(f: Frame, c: string): JSX.Element {
  const n = 7;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rad = 0.3 + rand(i * 7 + 3) * 0.1;
    pts.push([0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad]);
  }
  let d = `M ${f.x(pts[0]![0])} ${f.y(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${f.x(c1x)} ${f.y(c1y)} ${f.x(c2x)} ${f.y(c2y)} ${f.x(p2[0])} ${f.y(p2[1])}`;
  }
  d += " Z";
  return (
    <path
      d={d}
      fill={c}
      fillOpacity={0.16}
      stroke={c}
      strokeWidth={f.sw}
      strokeLinejoin="round"
    />
  );
}

/* ------------------------------------------------------------------ *
 * 分发
 * ------------------------------------------------------------------ */

function renderBody(id: AssetId, f: Frame, c: string, w: number, h: number): JSX.Element {
  switch (id) {
    case "icon-check":
      return IconCheck(f, c);
    case "icon-cross":
      return IconCross(f, c);
    case "icon-arrow-right":
      return IconArrowRight(f, c);
    case "icon-clock":
      return IconClock(f, c);
    case "icon-globe":
      return IconGlobe(f, c);
    case "icon-cpu":
      return IconCpu(f, c);
    case "icon-db":
      return IconDb(f, c);
    case "icon-wifi":
      return IconWifi(f, c);
    case "icon-lock":
      return IconLock(f, c);
    case "icon-coin":
      return IconCoin(f, c);
    case "icon-leaf":
      return IconLeaf(f, c);
    case "icon-sun":
      return IconSun(f, c);
    case "icon-warning":
      return IconWarning(f, c);
    case "icon-star":
      return IconStar(f, c);
    case "device-phone":
      return DevicePhone(f, c);
    case "device-laptop":
      return DeviceLaptop(f, c);
    case "window-browser":
      return WindowBrowser(f, c);
    case "grid-blueprint":
      return GridBlueprint(c, w, h);
    case "tex-noise":
      return TexNoise(c, w, h);
    case "shape-blob":
      return ShapeBlob(f, c);
    default:
      return assertNever(id);
  }
}

export function Asset(props: AssetProps): JSX.Element {
  const { id, w, h, tone } = props;
  return (
    <svg viewBox={"0 0 " + w + " " + h} width={w} height={h} fill="none">
      {renderBody(id, frame(w, h), resolveTone(tone), w, h)}
    </svg>
  );
}
