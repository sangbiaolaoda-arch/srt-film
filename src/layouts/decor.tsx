// 装饰层（母版）：每拍共用的画面结构元素 —— 点阵、四角裁切角标、底部进度条。
//
// 为什么单独一层：此前编辑风的纸白背景是真正的「白纸」—— 纯文字拍整页只有一行字，
// 图形拍周围也全是裸底。演讲 PPT 不素的根源不是每页都有图表，而是每页都有母版元素
// （页眉页脚、网格、角标）。这层就是那个母版：它不携带旁白信息，只提供「纸」的质感，
// 所以刻意保持静态 —— 不打 data-anim，随拍图层整体淡入，绝不动效抢戏。
//
// 导出链路：stage.tsx 把它挂在每拍的 [data-layer] 内，rasterize 序列化整层时自动带上。
// 注意：点阵用 SVG pattern，id 必须带拍号（23 拍 23 个装饰层共存于同一棵 DOM，
// 重复 id 会让所有引用解析到第一层）。

import type { Style } from "./types";
import { colorsOf } from "./render";
import { resolveProfile } from "../styles/style-system";

interface DecorProps {
  beat: number;
  /** 总拍数；缺省时进度条画满（画廊单帧预览没有总数） */
  total?: number;
  style?: Style;
}

/** 四角 L 形裁切角标：印刷加工标记，给画面一个「被装帧」的边界感。 */
function CornerMarks({ stroke }: { stroke: string }): JSX.Element {
  const m = 40; // 边距
  const a = 18; // 臂长
  const d = (x: number, y: number, dx: number, dy: number) =>
    `M${x + a * dx} ${y} L${x} ${y} L${x} ${y + a * dy}`;
  return (
    <g stroke={stroke} strokeWidth={1} fill="none">
      <path d={d(m, m, 1, 1)} />
      <path d={d(1280 - m, m, -1, 1)} />
      <path d={d(m, 720 - m, 1, -1)} />
      <path d={d(1280 - m, 720 - m, -1, -1)} />
    </g>
  );
}

/** 左缘竖排刻度：等分 8 格的短横线 + 一根通长细线，「仪器面板」的秩序感。 */
function SideRuler({ stroke, n }: { stroke: string; n: number }): JSX.Element {
  const x = 30;
  const y0 = 88;
  const y1 = 720 - 88;
  const ticks = [];
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const long = i % 2 === 0;
    ticks.push(<line key={i} x1={x} y1={y} x2={x + (long ? 10 : 5)} y2={y} />);
  }
  return (
    <g stroke={stroke} strokeWidth={1} opacity={0.7}>
      <line x1={x} y1={y0} x2={x} y2={y1} />
      {ticks}
    </g>
  );
}

/** density token 的消费点：装饰层全部几何参数由风格密度派生。
 *  三系密度 0.35/0.5/0.7 → 编辑风最疏、图表风最密。图表风的 40/200 是
 *  Phase 6 标定值（且 v2.tsx MeasGrid 硬编码同参数），作为密度 0.7 的
 *  锚点原样保留；编辑风的加号栅格随之变疏（48→61），扁平风两值都
 *  不走网格分支（grid token 关闭），不受影响。 */
function decorDensity(d: number): { fine: number; coarse: number; ticks: number; rings: number } {
  // 细网格步长：密度 0.7 处锚定 40px，每低 1 密度 +60px（更疏）
  const fine = Math.round(40 + (0.7 - d) * 60);
  return {
    fine, // 0.35→61 · 0.5→52 · 0.7→40
    coarse: fine * 5, // 粗网格步长（细的 5 倍）：0.35→305 · 0.5→260 · 0.7→200
    ticks: Math.round(4 + d * 8), // 左缘标尺格数：0.35→7 · 0.5→8 · 0.7→10
    rings: 1 + Math.ceil(d * 2), // 右上角同心环数：0.35→2 · 0.5→2 · 0.7→3
  };
}

export function DecorLayer({ beat, total, style }: DecorProps): JSX.Element {
  const c = colorsOf(style);
  const p = resolveProfile(style);
  const textured = p.paperTexture;
  // 图表风母版：测量网格（对位栅格的数据版）—— token grid 的消费方。
  // 没有它，图表风的非图表拍只剩「白底」，签名被稀释成换色。
  const gridded = p.grid;
  const dd = decorDensity(p.density);
  const frac = total && total > 0 ? Math.min(1, beat / total) : 1;
  const x0 = 64;
  const x1 = 1280 - 64;
  const span = x1 - x0;
  const pid = `decor-dots-${beat}`;
  const h = dd.fine / 2; // 加号栅格的中心（步长的一半）

  return (
    <g data-decor="">
      {textured ? (
        <>
          {/* 加号对位栅格（画法 A16）：印刷制版标记语汇，比圆点更像「被装帧的纸」。
              仅编辑风（paperTexture）启用：seed 固定，逐拍不跳变。
              步长由 density 派生（编辑风 0.35 → 61px，全系最疏）。 */}
          <defs>
            <pattern id={pid} width={dd.fine} height={dd.fine} patternUnits="userSpaceOnUse">
              <path
                d={`M${h} ${h - 3} L${h} ${h + 3} M${h - 3} ${h} L${h + 3} ${h}`}
                stroke={c.dim}
                strokeWidth={0.9}
                opacity={0.22}
                fill="none"
              />
            </pattern>
            <filter id={`decor-grain-${beat}`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={7} stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.04" intercept="0" />
              </feComponentTransfer>
            </filter>
          </defs>
          <rect x={0} y={0} width={1280} height={720} fill={`url(#${pid})`} />
          {/* 纸纹颗粒：极低透明度的分形噪声，给纯色底一点「纤维」 */}
          <rect x={0} y={0} width={1280} height={720} filter={`url(#decor-grain-${beat})`} />
        </>
      ) : (
        <>
          {gridded && (
            /* 图表风：细网格 + 粗网格（坐标纸语汇），步长由 density 派生
               （图表风 0.7 → 40/200，与 v2.tsx MeasGrid 同参数）。网格是恒定刻度，
               不随拍跳变；透明度压低到不抢内容。id 带拍号（多拍共存同一棵 DOM）。 */
            <g opacity={0.55}>
              <defs>
                <pattern id={`decor-grid-${beat}`} width={dd.fine} height={dd.fine} patternUnits="userSpaceOnUse">
                  <path d={`M${dd.fine} 0 L0 0 L0 ${dd.fine}`} fill="none" stroke={c.hairline} strokeWidth={1} />
                </pattern>
                <pattern id={`decor-grid5-${beat}`} width={dd.coarse} height={dd.coarse} patternUnits="userSpaceOnUse">
                  <path d={`M${dd.coarse} 0 L0 0 L0 ${dd.coarse}`} fill="none" stroke={c.hairline} strokeWidth={1.6} />
                </pattern>
              </defs>
              <rect x={0} y={0} width={1280} height={720} fill={`url(#decor-grid-${beat})`} />
              <rect x={0} y={0} width={1280} height={720} fill={`url(#decor-grid5-${beat})`} />
            </g>
          )}
          {/* 半调暗角（画法 A03 + vignette）：扁平矢量风与图表风净底，四角压暗聚焦中心 */}
          <defs>
            <radialGradient id={`decor-vig-${beat}`} cx="50%" cy="46%" r="78%">
              <stop offset="55%" stopColor="#000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000" stopOpacity={0.4} />
            </radialGradient>
          </defs>
          <rect x={0} y={0} width={1280} height={720} fill={`url(#decor-vig-${beat})`} />
        </>
      )}
      <CornerMarks stroke={c.hairline} />
      {!textured && <SideRuler stroke={c.hairline} n={dd.ticks} />}
      {!textured && (
        <g>
          {/* 右上角同心圆环：与右下角标呼应的几何锚点。环数由 density 决定
              （图表风 3 环最密）；21 环与四角裁切标保持净距（实测 3px+）。 */}
          {(dd.rings >= 3 ? [21, 15, 6] : [15, 6]).map((r) => (
            <circle key={r} cx={1216} cy={56} r={r} fill="none" stroke={c.hairline} strokeWidth={1} />
          ))}
        </g>
      )}
      {/* 底部进度条：本拍在整支片子里的位置 —— 播放器进度条的书页版 */}
      <line x1={x0} y1={706} x2={x1} y2={706} stroke={c.hairline} strokeWidth={1} />
      <line x1={x0} y1={706} x2={x0 + span * frac} y2={706} stroke={c.accent} strokeWidth={2.5} />
    </g>
  );
}
