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
function SideRuler({ stroke }: { stroke: string }): JSX.Element {
  const x = 30;
  const y0 = 88;
  const y1 = 720 - 88;
  const n = 8;
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

export function DecorLayer({ beat, total, style }: DecorProps): JSX.Element {
  const c = colorsOf(style);
  const poster = style === "poster";
  const frac = total && total > 0 ? Math.min(1, beat / total) : 1;
  const x0 = 64;
  const x1 = 1280 - 64;
  const span = x1 - x0;
  const pid = `decor-dots-${beat}`;

  return (
    <g data-decor="">
      {poster ? (
        <>
          {/* 半调暗角（画法 A03 + vignette）：四角压暗聚焦中心，海报风的「舞台灯」 */}
          <defs>
            <radialGradient id={`decor-vig-${beat}`} cx="50%" cy="46%" r="78%">
              <stop offset="55%" stopColor="#000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000" stopOpacity={0.4} />
            </radialGradient>
          </defs>
          <rect x={0} y={0} width={1280} height={720} fill={`url(#decor-vig-${beat})`} />
        </>
      ) : (
        <>
          {/* 加号对位栅格（画法 A16）：印刷制版标记语汇，比圆点更像「被装帧的纸」。
              seed 固定：纹理是同一张纸，逐拍不跳变。 */}
          <defs>
            <pattern id={pid} width={48} height={48} patternUnits="userSpaceOnUse">
              <path
                d="M24 21 L24 27 M21 24 L27 24"
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
      )}
      <CornerMarks stroke={c.hairline} />
      {!poster && <SideRuler stroke={c.hairline} />}
      {!poster && (
        <g>
          {/* 右上角同心圆环：与右下角标呼应的几何锚点 */}
          <circle cx={1216} cy={56} r={15} fill="none" stroke={c.hairline} strokeWidth={1} />
          <circle cx={1216} cy={56} r={6} fill="none" stroke={c.hairline} strokeWidth={1} />
        </g>
      )}
      {/* 底部进度条：本拍在整支片子里的位置 —— 播放器进度条的书页版 */}
      <line x1={x0} y1={706} x2={x1} y2={706} stroke={c.hairline} strokeWidth={1} />
      <line x1={x0} y1={706} x2={x0 + span * frac} y2={706} stroke={c.accent} strokeWidth={2.5} />
    </g>
  );
}
